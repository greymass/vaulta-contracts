import {beforeEach, describe, expect, test} from 'bun:test'

import {alice, configure, contracts, powerContract, resetContracts} from './setup'

describe('contract: power - Cost Estimation', () => {
    beforeEach(async () => {
        await resetContracts()
        await configure()
    })

    test('returns a positive quote', async () => {
        const traces = await contracts.power.actions.estimatecost([]).send(alice)
        const quote = traces[0].returnValue
        expect(quote.value).toBeGreaterThan(0)
    })

    test('rejects a quote when the fee prices below the chain minimum', async () => {
        await configure({cpu_frac: 1, net_frac: 1})
        await expect(contracts.power.actions.estimatecost([]).send(alice)).rejects.toThrow(
            "the configured resources price below the chain's minimum powerup fee"
        )
    })

    test('the quote covers a real powerup with change to spare', async () => {
        const traces = await contracts.power.actions.estimatecost([]).send(alice)
        const quote = traces[0].returnValue
        await contracts.token.actions
            .transfer([alice, powerContract, String(quote), ''])
            .send(alice)
        const orders = contracts.system.tables['powup.order'](BigInt(0)).getTableRows()
        expect(orders.length).toBe(1)
    })
})
