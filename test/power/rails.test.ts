import {beforeEach, describe, expect, test} from 'bun:test'
import {Asset, Name, TimePointSec} from '@wharfkit/antelope'

import {blockchain} from '../helpers'
import {
    alice,
    bob,
    configure,
    contracts,
    orderCount,
    powerContract,
    powerupDays,
    systemAccounts,
    systemContract,
    systemTokenContract,
} from './setup'

const wrapperContract = 'wrap.vaulta'
const wrappedSymbol = '4,A'
const backingSymbol = '4,EOS'

const wrapper = blockchain.createContract(
    wrapperContract,
    './shared/include/core.vaulta/core.vaulta',
    true,
    {privileged: true}
)

const rails = [
    {
        token_contract: wrapperContract,
        token_symbol: wrappedSymbol,
        powerup_contract: wrapperContract,
    },
    {
        token_contract: systemTokenContract,
        token_symbol: backingSymbol,
        powerup_contract: systemContract,
    },
]

function balance(contract: any, account: string, symbol: string): number {
    const scope = Name.from(account).value.value
    const primary = Asset.Symbol.from(symbol).code.value.value
    const row = contract.tables.accounts(scope).getTableRow(primary)
    return row ? Number(Asset.from(row.balance).units) : 0
}

const eosBalance = (account: string) => balance(contracts.token, account, backingSymbol)
const aBalance = (account: string) => balance(wrapper, account, wrappedSymbol)

function resourceConfig() {
    const targetTimestamp = new Date(blockchain.timestamp.toMilliseconds() + 365 * 86400 * 1000)
    return {
        current_weight_ratio: 10000000000000,
        target_weight_ratio: 10000000000000,
        assumed_stake_weight: 1000000000000,
        target_timestamp: TimePointSec.from(targetTimestamp),
        exponent: 2,
        decay_secs: 86400,
        min_price: Asset.fromFloat(0, backingSymbol),
        max_price: Asset.fromFloat(1000000, backingSymbol),
    }
}

async function bootMainnetTopology() {
    await blockchain.resetTables()
    blockchain.createAccounts(alice, bob, ...systemAccounts)

    const supply = Asset.fromFloat(1000000000, backingSymbol)
    await contracts.token.actions.create([systemTokenContract, String(supply)]).send()
    await contracts.token.actions.issue([systemTokenContract, String(supply), '']).send()

    await contracts.system.actions.init([0, backingSymbol]).send(systemContract)
    await contracts.system.actions
        .cfgpowerup([
            {
                net: resourceConfig(),
                cpu: resourceConfig(),
                powerup_days: powerupDays,
                min_powerup_fee: Asset.fromFloat(0.0001, backingSymbol),
            },
        ])
        .send(systemContract)

    await wrapper.actions
        .init([String(Asset.fromFloat(1000000000, wrappedSymbol))])
        .send(wrapperContract)

    await contracts.token.actions
        .transfer([systemTokenContract, alice, '1000.0000 EOS', ''])
        .send(systemTokenContract)

    // Swapping EOS into the wrapper funds alice with A and the wrapper with backing EOS
    await contracts.token.actions.transfer([alice, wrapperContract, '500.0000 EOS', '']).send(alice)

    await configure({rails})
}

describe('contract: power - Payment Rails', () => {
    beforeEach(async () => {
        await bootMainnetTopology()
    })

    test('boot sanity: alice holds both rails', () => {
        expect(eosBalance(alice)).toBe(5000000)
        expect(aBalance(alice)).toBe(5000000)
    })

    test('accepts the backing token on the direct rail and conserves the payment', async () => {
        const spentBefore = eosBalance(alice)
        const feesBefore = eosBalance('eosio.fees')
        const ramBefore = eosBalance('eosio.ram')
        await contracts.token.actions
            .transfer([alice, powerContract, '10.0000 EOS', ''])
            .send(alice)
        expect(orderCount()).toBe(1)
        const spent = spentBefore - eosBalance(alice)
        const feesGained = eosBalance('eosio.fees') - feesBefore
        const ramGained = eosBalance('eosio.ram') - ramBefore
        expect(spent).toBeGreaterThan(0)
        expect(spent).toBe(feesGained + ramGained)
        expect(eosBalance(powerContract)).toBe(0)
    })

    test('accepts the wrapped token on the wrapper rail and refunds in kind', async () => {
        const aBefore = aBalance(alice)
        const eosBefore = eosBalance(alice)
        const feesBefore = eosBalance('eosio.fees')
        const ramBefore = eosBalance('eosio.ram')
        await wrapper.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        expect(orderCount()).toBe(1)
        const spent = aBefore - aBalance(alice)
        const feesGained = eosBalance('eosio.fees') - feesBefore
        const ramGained = eosBalance('eosio.ram') - ramBefore
        expect(spent).toBeGreaterThan(0)
        expect(spent).toBeLessThan(100000)
        expect(spent).toBe(feesGained + ramGained)
        expect(eosBalance(alice)).toBe(eosBefore)
        expect(aBalance(powerContract)).toBe(0)
        expect(eosBalance(powerContract)).toBe(0)
    })

    test('the wrapper rail powers up the account named in the memo', async () => {
        await wrapper.actions.transfer([alice, powerContract, '10.0000 A', bob]).send(alice)
        expect(orderCount()).toBe(1)
        const order = contracts.system.tables['powup.order'](BigInt(0)).getTableRows()[0]
        expect(String(order.owner)).toBe(bob)
    })

    test('rejects a token from an unconfigured contract', async () => {
        const fakeSupply = Asset.fromFloat(1000000, backingSymbol)
        await contracts.faketoken.actions.create(['fake.token', String(fakeSupply)]).send()
        await contracts.faketoken.actions.issue(['fake.token', String(fakeSupply), '']).send()
        await contracts.faketoken.actions.transfer(['fake.token', alice, '100.0000 EOS', '']).send()
        await expect(
            contracts.faketoken.actions
                .transfer([alice, powerContract, '1.0000 EOS', ''])
                .send(alice)
        ).rejects.toThrow('the transfer matches no configured payment rail')
    })

    test('rejects a symbol no rail carries even on a rail contract', async () => {
        const supply = Asset.fromFloat(1000000, '4,WAX')
        await contracts.token.actions.create([systemTokenContract, String(supply)]).send()
        await contracts.token.actions.issue([systemTokenContract, String(supply), '']).send()
        await contracts.token.actions
            .transfer([systemTokenContract, alice, '100.0000 WAX', ''])
            .send(systemTokenContract)
        await expect(
            contracts.token.actions.transfer([alice, powerContract, '1.0000 WAX', '']).send(alice)
        ).rejects.toThrow('the transfer matches no configured payment rail')
    })

    test('configure rejects an empty rail list', async () => {
        await expect(configure({rails: []})).rejects.toThrow(
            'at least one payment rail is required'
        )
    })

    test('configure rejects more than four rails', async () => {
        const many = Array.from({length: 5}, (_, i) => ({
            token_contract: systemTokenContract,
            token_symbol: `4,${'ABCDE'[i]}TOK`,
            powerup_contract: systemContract,
        }))
        await expect(configure({rails: many})).rejects.toThrow(
            'at most four payment rails are allowed'
        )
    })

    test('configure rejects duplicate rails', async () => {
        await expect(configure({rails: [rails[0], rails[0]]})).rejects.toThrow(
            "each rail's token contract and symbol must be unique"
        )
    })

    test('configure rejects mixed rail precisions', async () => {
        const mixed = [
            rails[0],
            {
                token_contract: systemTokenContract,
                token_symbol: '3,EOS',
                powerup_contract: systemContract,
            },
        ]
        await expect(configure({rails: mixed})).rejects.toThrow(
            'all rail symbols must share one precision'
        )
    })

    test('configure rejects a rail on a nonexistent contract', async () => {
        const ghost = [
            {
                token_contract: 'no.such.acct',
                token_symbol: wrappedSymbol,
                powerup_contract: systemContract,
            },
        ]
        await expect(configure({rails: ghost})).rejects.toThrow(
            "each rail's token contract must be an existing account"
        )
    })
})
