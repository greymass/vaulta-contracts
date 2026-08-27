import {beforeEach, describe, expect, test} from 'bun:test'

import {alice, contracts, orderCount, powerupDays, resetContracts} from './setup'

describe('contract: power - harness', () => {
    beforeEach(async () => {
        await resetContracts()
    })

    test('the vendored system contract accepts a powerup and writes an order row', async () => {
        expect(orderCount()).toBe(0)
        await contracts.system.actions
            .powerup([alice, alice, powerupDays, 10000000000, 10000000000, '10.0000 A'])
            .send(alice)
        expect(orderCount()).toBe(1)
    })
})
