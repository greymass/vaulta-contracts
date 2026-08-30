import {beforeEach, describe, expect, test} from 'bun:test'

import {advanceTime} from '../helpers'
import {
    alice,
    committedBytes,
    configure,
    contracts,
    ledgerRow,
    measureTransfer,
    occupiedSlots,
    powerContract,
    resetContracts,
    setPowerupDays,
} from './setup'

const bucket = 3600

function transfer() {
    return contracts.token.actions.transfer([alice, powerContract, '10.0000 A', '']).send(alice)
}

describe('contract: power - RAM Ledger', () => {
    beforeEach(async () => {
        await resetContracts()
        await configure()
    })

    test('holds twenty-five slots', async () => {
        await transfer()
        expect(ledgerRow().slots.length).toBe(25)
    })

    test('records an order in the slot for the current bucket', async () => {
        await transfer()
        const occupied = occupiedSlots()
        expect(occupied.length).toBe(1)
        expect(committedBytes()).toBe(677)
    })

    test('rotates to a new slot when the bucket advances', async () => {
        await transfer()
        const first = occupiedSlots()[0].slot
        advanceTime(bucket)
        await transfer()
        const occupied = occupiedSlots()
        expect(occupied.length).toBe(2)
        expect(occupied.map((slot) => Number(slot.slot))).toContain(Number(first) + 1)
        expect(committedBytes()).toBe(677 + 405)
    })

    test('still counts an order in the twenty-fourth bucket after it', async () => {
        await transfer()
        advanceTime(24 * bucket)
        await transfer()
        expect(occupiedSlots().length).toBe(2)
        expect(committedBytes()).toBe(677 + 405)
    })

    test('drops an order once twenty-five buckets have passed', async () => {
        await transfer()
        const first = Number(occupiedSlots()[0].slot)
        advanceTime(25 * bucket)
        await transfer()
        const occupied = occupiedSlots()
        expect(occupied.length).toBe(1)
        expect(Number(occupied[0].slot)).toBe(first + 25)
        expect(committedBytes()).toBe(405)
    })

    test('reuses the ring index of the order it just dropped', async () => {
        await transfer()
        const first = Number(occupiedSlots()[0].slot)
        advanceTime(25 * bucket)
        await transfer()
        const reused = ledgerRow().slots[first % 25]
        expect(Number(reused.slot)).toBe(first + 25)
        expect(Number(reused.bytes)).toBe(405)
    })

    test('an idle ring expires every slot it holds', async () => {
        await transfer()
        advanceTime(60 * bucket)
        await transfer()
        expect(committedBytes()).toBe(405)
    })

    test('carries committed bytes across a change to powerup_days', async () => {
        await transfer()
        await setPowerupDays(7)
        await transfer()
        expect(committedBytes()).toBe(677 + 405)
    })

    test('a lengthened powerup window keeps the contract buying ram', async () => {
        await configure({cushion_bytes: 0})
        await transfer()
        await setPowerupDays(7)
        const result = await measureTransfer(alice, '10.0000 A')
        expect(result.ramGained).toBeGreaterThan(0)
    })

    test('carried bytes expire on the window they were bought under', async () => {
        await transfer()
        await setPowerupDays(7)
        await transfer()
        advanceTime(24 * bucket)
        await transfer()
        expect(committedBytes()).toBe(405 + 405)
    })

    test('a drained ring lets the contract refund the charge again', async () => {
        await configure({cushion_bytes: 0})
        await transfer()
        advanceTime(25 * bucket)
        const result = await measureTransfer(alice, '10.0000 A')
        expect(result.ramGained).toBe(0)
        expect(result.senderSpent).toBe(result.feesGained)
    })
})
