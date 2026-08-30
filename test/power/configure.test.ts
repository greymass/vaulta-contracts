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
})
