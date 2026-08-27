import {beforeEach, describe, expect, test} from 'bun:test'
import {Name} from '@wharfkit/antelope'

import {alice, configure, contracts, defaultConfig, powerContract, resetContracts} from './setup'

function quota(account: string): number {
    const scope = Name.from(account).value.value
    const row = contracts.system.tables.userres(scope).getTableRows()[0]
    return row ? Number(row.ram_bytes) : 0
}

describe('contract: power - RAM accounting', () => {
    beforeEach(async () => {
        await resetContracts()
        await configure()
    })

    test('reports the measured cost of one order', async () => {
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        // eslint-disable-next-line no-console
        console.log('contract ram quota after one order:', quota(powerContract))
        expect(quota(powerContract)).toBeGreaterThan(0)
    })

    test('buys at least the bytes one order occupies', async () => {
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        const occupied = defaultConfig.order_bytes + defaultConfig.userres_bytes
        expect(quota(powerContract)).toBeGreaterThanOrEqual(occupied)
    })

    test('runs forty consecutive orders without error', async () => {
        for (let i = 0; i < 40; i++) {
            await contracts.token.actions
                .transfer([alice, powerContract, '10.0000 A', ''])
                .send(alice)
        }
        const orders = contracts.system.tables['powup.order'](BigInt(0)).getTableRows()
        expect(orders.length).toBe(40)
    })
})
