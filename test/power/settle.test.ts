import {beforeEach, describe, expect, test} from 'bun:test'
import {Asset} from '@wharfkit/antelope'

import {
    alice,
    configure,
    contracts,
    measureTransfer,
    powerContract,
    resetContracts,
    tokenBalance,
} from './setup'

const payment = '10.0000 A'

describe('contract: power - Settlement', () => {
    beforeEach(async () => {
        await resetContracts()
        await configure()
    })

    test('the contract retains no balance after a powerup', async () => {
        await measureTransfer(alice, payment)
        expect(tokenBalance(powerContract)).toBe(0)
    })

    test('the sender is refunded everything the order did not consume', async () => {
        const result = await measureTransfer(alice, payment)
        expect(result.senderSpent).toBeGreaterThan(0)
        expect(result.senderSpent).toBeLessThan(Number(Asset.from(payment).units))
    })

    test('an over-drawn contract buys ram with the charge', async () => {
        const result = await measureTransfer(alice, payment)
        expect(result.ramGained).toBeGreaterThan(0)
    })

    test('rejects a top level logpowerup', async () => {
        await expect(
            contracts.power.actions
                .logpowerup([alice, alice, '1.0000 A', '1.0000 A', '0.0000 A'])
                .send(powerContract)
        ).rejects.toThrow('logpowerup runs only as an inline action of this contract')
    })

    test('a funded contract refunds the ram charge to the sender', async () => {
        await configure({cushion_bytes: 0})
        await contracts.system.actions.buyrambytes([alice, powerContract, 1000000]).send(alice)
        const result = await measureTransfer(alice, payment)
        expect(result.ramGained).toBe(0)
        expect(result.senderSpent).toBeGreaterThan(0)
        expect(result.senderSpent).toBe(result.feesGained)
    })
})
