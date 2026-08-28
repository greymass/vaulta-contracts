import {beforeEach, describe, expect, test} from 'bun:test'
import {Name} from '@wharfkit/antelope'

import {advanceTime} from '../helpers'
import {
    alice,
    bob,
    contracts,
    getCreator,
    giftContract,
    giftInTx,
    newuser,
    newuser2,
    newuser3,
    packAction,
    resetContracts,
    sendActions,
} from './setup'

function getGiftedRam(account: string) {
    return contracts.system.tables
        .giftedram(Name.from('eosio').value.value)
        .getTableRow(Name.from(account).value.value)
}

describe('contract: gift - giftacct', () => {
    beforeEach(async () => {
        await resetContracts()
        await contracts.gift.actions.enable().send()
        await contracts.gift.actions.addcreator([alice, 10000]).send()
    })

    test('gifts RAM via inline eosio::giftram when the transaction creates the account', async () => {
        await giftInTx(alice, newuser, 4000, 'welcome')
        const row = getGiftedRam(newuser)
        expect(row).toBeDefined()
        expect(row.gifter).toBe(giftContract)
        expect(Number(row.ram_bytes)).toBe(4000)
        expect(Number(getCreator(alice).used_bytes)).toBe(4136)
    })

    test('rejects a gift while the contract is disabled', async () => {
        await contracts.gift.actions.disable().send()
        await expect(giftInTx(alice, newuser, 4000)).rejects.toThrow('contract is disabled')
    })

    test('rejects a gift without a same-transaction newaccount', async () => {
        await expect(
            contracts.gift.actions.giftacct([alice, newuser, 4000, '']).send(alice)
        ).rejects.toThrow('must be created by eosio::newaccount in the same transaction')
    })

    test('rejects a gift when the newaccount creates a different account', async () => {
        await expect(
            sendActions(
                packAction(contracts.system, 'newaccount', {creator: alice, account: bob}, alice),
                packAction(
                    contracts.gift,
                    'giftacct',
                    {creator: alice, account: newuser, bytes: 4000, memo: ''},
                    alice
                )
            )
        ).rejects.toThrow('must be created by eosio::newaccount in the same transaction')
    })

    test('accepts a newaccount signed by an account other than the paying creator, as premium sub-name creation requires', async () => {
        await giftInTx(alice, newuser, 4000, '', bob)
        expect(Number(getGiftedRam(newuser).ram_bytes)).toBe(4000)
        expect(Number(getCreator(alice).used_bytes)).toBe(4136)
    })

    test('gifts to two accounts created in one transaction', async () => {
        await sendActions(
            packAction(contracts.system, 'newaccount', {creator: alice, account: newuser}, alice),
            packAction(contracts.system, 'newaccount', {creator: alice, account: newuser2}, alice),
            packAction(
                contracts.gift,
                'giftacct',
                {creator: alice, account: newuser, bytes: 1000, memo: ''},
                alice
            ),
            packAction(
                contracts.gift,
                'giftacct',
                {creator: alice, account: newuser2, bytes: 2000, memo: ''},
                alice
            )
        )
        expect(Number(getGiftedRam(newuser).ram_bytes)).toBe(1000)
        expect(Number(getGiftedRam(newuser2).ram_bytes)).toBe(2000)
        expect(Number(getCreator(alice).used_bytes)).toBe(3272)
    })

    test('requires the creator authority', async () => {
        await expect(
            contracts.gift.actions.giftacct([alice, newuser, 4000, '']).send(bob)
        ).rejects.toThrow('missing required authority')
    })

    test('rejects an unregistered creator', async () => {
        await expect(
            contracts.gift.actions.giftacct([bob, newuser, 4000, '']).send(bob)
        ).rejects.toThrow('creator not registered')
    })

    test('rejects non-positive bytes', async () => {
        await expect(
            contracts.gift.actions.giftacct([alice, newuser, 0, '']).send(alice)
        ).rejects.toThrow('must gift positive bytes')
    })

    test('rejects negative bytes', async () => {
        await expect(
            contracts.gift.actions.giftacct([alice, newuser, -1, '']).send(alice)
        ).rejects.toThrow('must gift positive bytes')
    })

    test('rejects a gift to a nonexistent account', async () => {
        await expect(
            contracts.gift.actions.giftacct([alice, 'missing', 4000, '']).send(alice)
        ).rejects.toThrow('account does not exist')
    })

    test('accepts a memo of exactly 256 bytes', async () => {
        await giftInTx(alice, newuser, 4000, 'x'.repeat(256))
        expect(Number(getGiftedRam(newuser).ram_bytes)).toBe(4000)
    })

    test('rejects a memo longer than 256 bytes', async () => {
        await expect(
            contracts.gift.actions.giftacct([alice, newuser, 4000, 'x'.repeat(257)]).send(alice)
        ).rejects.toThrow('memo has more than 256 bytes')
    })

    test('debits the giftedram row overhead against the quota', async () => {
        await giftInTx(alice, newuser, 4000)
        expect(Number(getCreator(alice).used_bytes)).toBe(4136)
        await giftInTx(alice, newuser2, 5728)
        expect(Number(getCreator(alice).used_bytes)).toBe(10000)
        await expect(giftInTx(alice, newuser3, 1)).rejects.toThrow('daily quota exceeded')
    })

    test('accepts a gift that exactly fills the quota including overhead', async () => {
        await giftInTx(alice, newuser, 9864)
        expect(Number(getCreator(alice).used_bytes)).toBe(10000)
    })

    test('rejects a single gift that exceeds the quota minus overhead', async () => {
        await expect(giftInTx(alice, newuser, 9865)).rejects.toThrow('daily quota exceeded')
    })

    test('rejects a gift that would overflow the quota check', async () => {
        await giftInTx(alice, newuser, 1)
        await expect(
            contracts.gift.actions
                .giftacct([alice, newuser2, '9223372036854775807', ''])
                .send(alice)
        ).rejects.toThrow('daily quota exceeded')
    })

    test('rejects a gift once the quota is lowered below the bytes already used', async () => {
        await giftInTx(alice, newuser, 4000)
        await contracts.gift.actions.setquota([alice, 1000]).send()
        await expect(giftInTx(alice, newuser2, 1)).rejects.toThrow('daily quota exceeded')
    })

    test('resets the window after 24 hours', async () => {
        await giftInTx(alice, newuser, 9864)
        advanceTime(86401)
        await giftInTx(alice, newuser2, 4000)
        expect(Number(getCreator(alice).used_bytes)).toBe(4136)
    })

    test('resets the window at exactly 24 hours', async () => {
        await giftInTx(alice, newuser, 9864)
        advanceTime(86400)
        await giftInTx(alice, newuser2, 4000)
        expect(Number(getCreator(alice).used_bytes)).toBe(4136)
    })

    test('does not reset the window before 24 hours', async () => {
        await giftInTx(alice, newuser, 9864)
        advanceTime(86000)
        await expect(giftInTx(alice, newuser2, 1)).rejects.toThrow('daily quota exceeded')
    })

    test('measures the window from the first gift, not the most recent one', async () => {
        await giftInTx(alice, newuser, 1000)
        advanceTime(86000)
        await giftInTx(alice, newuser2, 1000)
        expect(Number(getCreator(alice).used_bytes)).toBe(2272)
        advanceTime(400)
        await giftInTx(alice, newuser3, 1000)
        expect(Number(getCreator(alice).used_bytes)).toBe(1136)
    })

    test('removing and re-registering a creator resets its used bytes', async () => {
        await giftInTx(alice, newuser, 9864)
        expect(Number(getCreator(alice).used_bytes)).toBe(10000)
        await contracts.gift.actions.rmcreator([alice]).send()
        await contracts.gift.actions.addcreator([alice, 10000]).send()
        expect(Number(getCreator(alice).used_bytes)).toBe(0)
        await giftInTx(alice, newuser2, 4000)
        expect(Number(getCreator(alice).used_bytes)).toBe(4136)
    })

    test('single-gifter constraint propagates from the system contract', async () => {
        await contracts.system.actions.giftram([bob, newuser, 100, '']).send(bob)
        await expect(giftInTx(alice, newuser, 4000)).rejects.toThrow(
            'A single RAM gifter is allowed'
        )
    })
})
