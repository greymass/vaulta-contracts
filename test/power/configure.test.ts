import {beforeEach, describe, expect, test} from 'bun:test'

import {configure, resetContracts} from './setup'

describe('contract: power - Configuration', () => {
    beforeEach(async () => {
        await resetContracts()
    })

    test('rejects an allotment requesting no resources', async () => {
        await expect(configure({cpu_frac: 0, net_frac: 0})).rejects.toThrow(
            'the allotment must request some resource'
        )
    })

    test('rejects order_bytes beyond the sane bound', async () => {
        await expect(configure({order_bytes: 1000001})).rejects.toThrow(
            'order_bytes must not exceed one million'
        )
    })

    test('rejects userres_bytes beyond the sane bound', async () => {
        await expect(configure({userres_bytes: 1000001})).rejects.toThrow(
            'userres_bytes must not exceed one million'
        )
    })
})
