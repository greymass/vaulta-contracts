// Live-chain check of the deployed power contract's configuration and cost quote; run: bun testnet/verify-power.ts

import type {API} from '@wharfkit/antelope'
import {Action, APIClient, APIError, Asset, Bytes, Name, Serializer, Transaction} from '@wharfkit/antelope'

const networkEnv = process.env.NETWORK ?? 'testnet'
if (networkEnv !== 'testnet' && networkEnv !== 'mainnet') {
    throw new Error(`NETWORK must be "testnet" or "mainnet", got "${networkEnv}"`)
}
const network = networkEnv.toUpperCase()
for (const required of [`${network}_NODE_URL`, `POWER_${network}_ACCOUNT`]) {
    if (!process.env[required]) throw new Error(`${required} is not set in .env`)
}

const client = new APIClient({url: process.env[`${network}_NODE_URL`]})
const powerAccount = process.env[`POWER_${network}_ACCOUNT`]!

console.log(`node:            ${process.env[`${network}_NODE_URL`]}`)
console.log(`power contract:  ${powerAccount}`)

function formatException(except: API.v1.SendTransactionResponseException): string {
    const top = except.stack?.[0]
    if (typeof top?.data?.s === 'string') return top.data.s
    return except.message
}

try {
    const {rows} = await client.v1.chain.get_table_rows({
        code: powerAccount,
        scope: powerAccount,
        table: 'config',
        json: true,
    })
    if (rows.length === 0) {
        throw new Error('the "config" singleton is empty; run configure before verifying')
    }
    const cfg = rows[0]
    console.log('\nconfiguration:')
    for (const rail of cfg.rails) {
        console.log(
            `  rail:           ${rail.token_symbol} via ${rail.token_contract} -> ${rail.powerup_contract}::powerup`
        )
    }
    console.log(`  cpu_frac:       ${cfg.cpu_frac}`)
    console.log(`  net_frac:       ${cfg.net_frac}`)
    console.log(`  order_bytes:    ${cfg.order_bytes}`)
    console.log(`  userres_bytes:  ${cfg.userres_bytes}`)
    console.log(`  cushion_bytes:  ${cfg.cushion_bytes}`)

    const action = Action.from({
        account: Name.from(powerAccount),
        name: 'estimatecost',
        authorization: [],
        data: Bytes.from(''),
    })
    const transaction = Transaction.from({
        ref_block_num: 0,
        ref_block_prefix: 0,
        expiration: 0,
        actions: [action],
    })
    const response = await client.v1.chain.send_read_only_transaction(transaction)
    if (response.processed.except) {
        throw new Error(formatException(response.processed.except))
    }
    const hexData = response.processed.action_traces[0].return_value_hex_data
    const quote = Serializer.decode({data: hexData, type: Asset})
    console.log(`\nestimated cost:  ${quote}`)

    const {rows: userres} = await client.v1.chain.get_table_rows({
        code: 'eosio',
        scope: powerAccount,
        table: 'userres',
        json: true,
    })
    const ramBytes = userres[0]?.ram_bytes ?? 0
    console.log(`ram quota:       ${ramBytes} bytes (eosio userres, scope ${powerAccount})`)
} catch (error) {
    let message = error instanceof Error ? error.message : String(error)
    if (error instanceof APIError && error.details[0]?.message) {
        message = error.details[0].message
    }
    console.log(`\nverification FAILED: ${message}`)
    process.exit(1)
}
