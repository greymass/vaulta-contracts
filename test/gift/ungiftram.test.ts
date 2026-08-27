import {beforeEach, describe, expect, test} from 'bun:test'
import {Name} from '@wharfkit/antelope'

import {
    alice,
    bob,
    contracts,
    getCreator,
    giftContract,
    giftInTx,
    newuser,
    resetContracts,
} from './setup'

function getGiftedRam(account: string) {
    return contracts.system.tables
        .giftedram(Name.from('eosio').value.value)
        .getTableRow(Name.from(account).value.value)
}

describe('contract: gift - ungiftram', () => {
    beforeEach(async () => {
        await resetContracts()
        await contracts.gift.actions.enable().send()
        await contracts.gift.actions.addcreator([alice, 10000]).send()
        await giftInTx(alice, newuser, 4000, 'welcome')
    })

    test('giftee returns the gifted RAM and the giftedram row is removed', async () => {
        await contracts.system.actions.ungiftram([newuser, giftContract, '']).send(newuser)
        expect(getGiftedRam(newuser)).toBeUndefined()
    })

    test('requires the giftee authority', async () => {
        await expect(
            contracts.system.actions.ungiftram([newuser, giftContract, '']).send(bob)
        ).rejects.toThrow('missing required authority')
    })

    test('rejects naming the wrong gifter', async () => {
        await expect(
            contracts.system.actions.ungiftram([newuser, bob, '']).send(newuser)
        ).rejects.toThrow(`Returning RAM to wrong gifter, should be: ${giftContract}`)
    })

    test('rejects an account holding no gifted RAM', async () => {
        await expect(
            contracts.system.actions.ungiftram([bob, giftContract, '']).send(bob)
        ).rejects.toThrow(`${bob} does not hold any gifted RAM`)
    })

    test('does not credit the creator quota back on return (spend-rate limit, not a balance)', async () => {
        await contracts.system.actions.ungiftram([newuser, giftContract, '']).send(newuser)
        expect(Number(getCreator(alice).used_bytes)).toBe(4136)
    })
})
