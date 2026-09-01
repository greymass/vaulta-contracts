import {beforeEach, describe, expect, test} from 'bun:test'

import {alice, bob, configure, contracts, longName, powerContract, resetContracts} from './setup'

describe('contract: power - Transfer Handling', () => {
    beforeEach(async () => {
        await resetContracts()
        await configure()
    })

    test('rejects a token from an undesignated contract', async () => {
        await expect(
            contracts.faketoken.actions.transfer([alice, powerContract, '1.0000 A', '']).send(alice)
        ).rejects.toThrow('the transfer matches no configured payment rail')
    })

    test('rejects a memo that is not an account name', async () => {
        await expect(
            contracts.token.actions
                .transfer([alice, powerContract, '1.0000 A', 'NOT A NAME'])
                .send(alice)
        ).rejects.toThrow()
    })

    test('rejects a memo naming an account that does not exist', async () => {
        await expect(
            contracts.token.actions
                .transfer([alice, powerContract, '1.0000 A', 'nosuchacct11'])
                .send(alice)
        ).rejects.toThrow('does not exist')
    })

    test('rejects a thirteen character memo outside the name alphabet', async () => {
        await expect(
            contracts.token.actions
                .transfer([alice, powerContract, '1.0000 A', 'hello world!!'])
                .send(alice)
        ).rejects.toThrow('character is not in allowed character set for names')
    })

    test('rejects a thirteen character memo with a bad thirteenth character', async () => {
        await expect(
            contracts.token.actions
                .transfer([alice, powerContract, '1.0000 A', 'atticlabeosbz'])
                .send(alice)
        ).rejects.toThrow('thirteenth character in name cannot be a letter that comes after j')
    })

    test('rejects a memo longer than an account name', async () => {
        await expect(
            contracts.token.actions
                .transfer([alice, powerContract, '1.0000 A', 'aaaaaaaaaaaaaaaa'])
                .send(alice)
        ).rejects.toThrow('memo must be empty or a single account name')
    })

    test('a bare transfer powers up the sender', async () => {
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
        const orders = contracts.system.tables['powup.order'](BigInt(0)).getTableRows()
        expect(orders.length).toBe(1)
        expect(orders[0].owner).toBe(alice)
    })

    test('a memo redirects the powerup to the named account', async () => {
        await contracts.token.actions.transfer([alice, powerContract, '10.0000 A', bob]).send(alice)
        const orders = contracts.system.tables['powup.order'](BigInt(0)).getTableRows()
        expect(orders.length).toBe(1)
        expect(orders[0].owner).toBe(bob)
    })

    test('a memo naming a thirteen character account powers that account up', async () => {
        await contracts.token.actions
            .transfer([alice, powerContract, '10.0000 A', longName])
            .send(alice)
        const orders = contracts.system.tables['powup.order'](BigInt(0)).getTableRows()
        expect(orders.length).toBe(1)
        expect(orders[0].owner).toBe(longName)
    })

    test('rejects a payment that cannot cover the ram charge', async () => {
        await expect(
            contracts.token.actions.transfer([alice, powerContract, '0.0001 A', '']).send(alice)
        ).rejects.toThrow('does not cover the RAM cost')
    })
})
