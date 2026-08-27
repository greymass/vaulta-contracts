import {beforeEach, describe, expect, test} from 'bun:test'
import {Asset, Name} from '@wharfkit/antelope'

import {
    alice,
    configure,
    contracts,
    feeSink,
    powerContract,
    resetContracts,
    systemTokenSymbol,
} from './setup'

function balance(account: string): Asset {
    const scope = Name.from(account).value.value
    const primary = Asset.Symbol.from(systemTokenSymbol).code.value.value
    const row = contracts.token.tables.accounts(scope).getTableRow(primary)
    return row ? Asset.from(row.balance) : Asset.fromFloat(0, systemTokenSymbol)
}

describe('contract: power - Settlement', () => {
    beforeEach(async () => {
        await resetContracts()
        await configure()
    })

    test('the contract retains no balance after a powerup', async () => {
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        expect(balance(powerContract).value).toBe(0)
    })

    test('the sender is refunded everything the order did not consume', async () => {
        const before = balance(alice).value
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        const after = balance(alice).value
        expect(after).toBeLessThan(before)
        expect(after).toBeGreaterThan(before - 10)
    })

    test('an over-drawn contract buys ram instead of forwarding the charge', async () => {
        const before = balance(feeSink).value
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        expect(balance(feeSink).value).toBe(before)
    })

    test('rejects a top level logpowerup', async () => {
        await expect(
            contracts.power.actions
                .logpowerup([alice, alice, '1.0000 A', '1.0000 A', '0.0000 A'])
                .send(powerContract)
        ).rejects.toThrow('logpowerup runs only as an inline action of this contract')
    })

    test('a funded contract forwards the charge to the fee sink', async () => {
        await configure({cushion_bytes: 0})
        await contracts.system.actions.buyrambytes([alice, powerContract, 1000000]).send(alice)
        const before = balance(feeSink).value
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        expect(balance(feeSink).value).toBeGreaterThan(before)
    })
})
