import {beforeEach, describe, expect, test} from 'bun:test'
import {Asset, TimePointSec} from '@wharfkit/antelope'

import {advanceTime, blockchain} from '../helpers'
import {
    alice,
    configure,
    contracts,
    orderCount,
    powerContract,
    resetContracts,
    systemContract,
    systemTokenSymbol,
} from './setup'

async function configureRampedMarket() {
    const targetTimestamp = new Date(blockchain.timestamp.toMilliseconds() + 365 * 86400 * 1000)
    const resource = {
        current_weight_ratio: 10000000000000,
        target_weight_ratio: 5000000000000,
        assumed_stake_weight: 1000000000000,
        target_timestamp: TimePointSec.from(targetTimestamp),
        exponent: 2,
        decay_secs: 86400,
        min_price: Asset.fromFloat(0, systemTokenSymbol),
        max_price: Asset.fromFloat(1000000, systemTokenSymbol),
    }
    await contracts.system.actions
        .cfgpowerup([
            {
                net: resource,
                cpu: resource,
                powerup_days: 90,
                min_powerup_fee: Asset.fromFloat(0.0001, systemTokenSymbol),
            },
        ])
        .send(systemContract)
}

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

    test('the quote tracks the weight ramp instead of quoting stale market state', async () => {
        await configureRampedMarket()
        await configure({cpu_frac: 10000000000000})
        await contracts.token.actions.transfer([alice, powerContract, '200.0000 A', '']).send(alice)
        const q1 = Asset.from(
            (await contracts.power.actions.estimatecost([]).send(alice))[0].returnValue
        )
        advanceTime(30 * 86400)
        const q2 = Asset.from(
            (await contracts.power.actions.estimatecost([]).send(alice))[0].returnValue
        )
        expect(Number(q2.units)).toBeLessThan(Number(q1.units))
        await contracts.token.actions.transfer([alice, powerContract, String(q2), '']).send(alice)
        expect(orderCount()).toBe(2)
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
