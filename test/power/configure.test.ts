import {beforeEach, describe, expect, test} from 'bun:test'

import {configure, powerContract, resetContracts} from './setup'

describe('contract: power - Configuration', () => {
    beforeEach(async () => {
        await resetContracts()
    })

    test('rejects a fee sink set to the contract itself', async () => {
        await expect(configure({fee_sink: powerContract})).rejects.toThrow(
            'the fee sink must not be the contract itself'
        )
    })
})
