import {Action, KeyType, Name, PrivateKey} from '@wharfkit/antelope'
import {Chains, Session} from '@wharfkit/session'
import {WalletPluginPrivateKey} from '@wharfkit/wallet-plugin-privatekey'

import {Contract as GiftContract} from '../codegen/gift'
import {client, walletPlugin} from './common'

const giftAccount = process.env.GIFT_TESTNET_ACCOUNT!
const operatorAccount = process.env.TESTNET_TEST_ACCOUNT!
const giftContract = new GiftContract({account: giftAccount, client})

const operatorSession = new Session({
    chain: Chains.Jungle4,
    actor: operatorAccount,
    permission: 'active',
    walletPlugin,
})

const alphabet = 'abcdefghijklmnopqrstuvwxyz12345'
let suffix = ''
for (let i = 0; i < 8; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
const newAccount = `demo${suffix}`
const newKey = PrivateKey.generate(KeyType.K1)
const auth = {
    threshold: 1,
    keys: [{key: newKey.toPublic(), weight: 1}],
    accounts: [],
    waits: [],
}

console.log(`Generated account: ${newAccount}`)
console.log(`Generated private key (testnet-only, throwaway): ${newKey.toWif()}`)

const {abi} = await client.v1.chain.get_abi('eosio')

const config = await client.v1.chain.get_table_rows({
    code: giftAccount,
    scope: giftAccount,
    table: 'config',
    json: true,
})
if (!config.rows[0]?.enabled) {
    throw new Error(`${giftAccount} is disabled; run the enable action before gifting.`)
}

console.log(`Creating ${newAccount} — one transaction, one signature (${operatorAccount})`)

const result = await operatorSession.transact({
    actions: [
        Action.from(
            {
                account: 'eosio',
                name: 'newaccount',
                authorization: [{actor: operatorAccount, permission: 'active'}],
                data: {creator: operatorAccount, name: newAccount, owner: auth, active: auth},
            },
            abi
        ),
        giftContract.action(
            'giftacct',
            {
                creator: operatorAccount,
                account: newAccount,
                bytes: 4000,
                memo: 'gifted account demo',
            },
            {authorization: [{actor: operatorAccount, permission: 'active'}]}
        ),
    ],
})
if (!result.resolved) throw new Error('Transaction failed')
console.log(`Created: https://jungle4.unicove.com/transaction/${result.resolved.transaction.id}`)

await new Promise((resolve) => setTimeout(resolve, 1500))

const gifted = await client.v1.chain.get_table_rows({
    code: 'eosio',
    scope: 'eosio',
    table: 'giftedram',
    lower_bound: Name.from(newAccount),
    upper_bound: Name.from(newAccount),
    json: true,
})
const giftedRow = gifted.rows[0]
console.log('giftedram row:', JSON.stringify(giftedRow))
if (!giftedRow || giftedRow.gifter !== giftAccount || Number(giftedRow.ram_bytes) !== 4000) {
    throw new Error(`giftedram row does not prove the gift: ${JSON.stringify(giftedRow)}`)
}
console.log('giftedram row verified: gifter and ram_bytes match the demo gift.')

const [powupStateRow] = (
    await client.v1.chain.get_table_rows({
        code: 'eosio',
        scope: '',
        table: 'powup.state',
        json: true,
    })
).rows
if (!powupStateRow) throw new Error('powup.state is empty; powerup market is not initialized')
const minFee = powupStateRow.min_powerup_fee as string
const [minFeeAmount, feeSymbolCode] = minFee.split(' ')
const feeDecimals = (minFeeAmount.split('.')[1] || '').length
// 50x the min fee as a payment ceiling; actual cost is expected to be far below it
const maxPayment = `${(parseFloat(minFeeAmount) * 50).toFixed(feeDecimals)} ${feeSymbolCode}`

console.log(`Powering up ${newAccount} with CPU/NET so it can attempt sellram.`)
let powerupResult
try {
    powerupResult = await operatorSession.transact({
        action: Action.from(
            {
                account: 'eosio',
                name: 'powerup',
                authorization: [{actor: operatorAccount, permission: 'active'}],
                data: {
                    payer: operatorAccount,
                    receiver: newAccount,
                    days: powupStateRow.powerup_days,
                    net_frac: 50_000_000_000,
                    cpu_frac: 50_000_000_000,
                    max_payment: maxPayment,
                },
            },
            abi
        ),
    })
} catch (error) {
    console.log(`powerup failed: ${String(error)}`)
    console.log('powerup error details:', JSON.stringify((error as {details?: unknown})?.details))
    throw error
}
if (!powerupResult.resolved) throw new Error('powerup transaction failed')
console.log(
    `Powered up: https://jungle4.unicove.com/transaction/${powerupResult.resolved.transaction.id}`
)

await new Promise((resolve) => setTimeout(resolve, 1500))

const newSession = new Session({
    chain: Chains.Jungle4,
    actor: newAccount,
    permission: 'active',
    walletPlugin: new WalletPluginPrivateKey(newKey),
})
const sequestrationProof = /insufficient quota|no resource row/i
try {
    await newSession.transact({
        action: Action.from(
            {
                account: 'eosio',
                name: 'sellram',
                authorization: [{actor: newAccount, permission: 'active'}],
                data: {account: newAccount, bytes: 1000},
            },
            abi
        ),
    })
    console.log('UNEXPECTED: sellram succeeded — gifted RAM was sellable')
    process.exit(1)
} catch (error) {
    const message = String(error)
    const details = JSON.stringify((error as {details?: unknown})?.details)
    console.log(`sellram error details: ${details}`)
    if (sequestrationProof.test(message) || sequestrationProof.test(details)) {
        console.log(`sellram correctly rejected: ${message}`)
    } else {
        console.log(
            `sellram failed for an unrelated reason, not proof of sequestration: ${message}`
        )
        process.exit(1)
    }
}
