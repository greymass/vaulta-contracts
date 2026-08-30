// RAM safety check for the power contract's cushion and ring; run before and after deploys: bun testnet/check-power-ram.ts

import {statSync} from 'node:fs'

import {APIClient} from '@wharfkit/antelope'

// setcode bills wasm size times this multiplier (spring config.hpp setcode_ram_bytes_multiplier)
const SETCODE_MULTIPLIER = 10
// account, permission and singleton row overhead; measured 12,929 bytes live on Jungle 4
const ACCOUNT_OVERHEAD_BYTES = 16384
const MARGIN_PERCENT = 10
const RING_SLOTS = 25

const networkEnv = process.env.NETWORK ?? 'testnet'
if (networkEnv !== 'testnet' && networkEnv !== 'mainnet') {
    throw new Error(`NETWORK must be "testnet" or "mainnet", got "${networkEnv}"`)
}
const network = networkEnv.toUpperCase()
for (const required of [`${network}_NODE_URL`, `POWER_${network}_ACCOUNT`]) {
    if (!process.env[required]) throw new Error(`${required} is not set in .env`)
}

const client = new APIClient({url: process.env[`${network}_NODE_URL`]})
const powerAccount = process.env[`POWER_${network}_ACCOUNT`]!
const contractName = process.env.POWER_CONTRACT_NAME ?? 'power'

console.log(`node:            ${process.env[`${network}_NODE_URL`]}`)
console.log(`power contract:  ${powerAccount}`)

function artifactFloor(): number {
    const wasm = statSync(`contracts/${contractName}/build/${contractName}.wasm`).size
    const abi = statSync(`contracts/${contractName}/build/${contractName}.abi`).size
    const floor = wasm * SETCODE_MULTIPLIER + abi + ACCOUNT_OVERHEAD_BYTES
    console.log('\nartifact floor (the build about to deploy, or currently deployed):')
    console.log(
        `  wasm:           ${wasm} bytes (bills ${wasm * SETCODE_MULTIPLIER} at ${SETCODE_MULTIPLIER}x)`
    )
    console.log(`  abi:            ${abi} bytes`)
    console.log(`  overhead:       ${ACCOUNT_OVERHEAD_BYTES} bytes`)
    console.log(`  floor:          ${floor} bytes`)
    return floor
}

async function getRow(code: string, scope: string, table: string) {
    const {rows} = await client.v1.chain.get_table_rows({code, scope, table, json: true})
    return rows.length > 0 ? rows[0] : undefined
}

async function expectedDuration(): Promise<number | undefined> {
    const state = await getRow('eosio', '0', 'powup.state')
    if (!state) return undefined
    return (Number(state.powerup_days) * 86400) / 24
}

// Mirrors record_and_measure in contracts/power/src/ledger.cpp; keep the two in sync
function ringState(ledger: any, quota: number, chainDuration: number | undefined) {
    const problems: string[] = []
    const duration = Number(ledger.duration)
    const carry = Number(ledger.carry_bytes)
    const now = Math.floor(Date.now() / 1000)

    if (ledger.slots.length !== RING_SLOTS) {
        problems.push(`ledger holds ${ledger.slots.length} slots, expected ${RING_SLOTS}`)
    }
    if (!(duration > 0) || duration % 3600 !== 0) {
        problems.push(`duration ${ledger.duration} is not a positive multiple of 3600`)
    }
    if (carry < 0) {
        problems.push(`carry_bytes ${ledger.carry_bytes} is negative`)
    }

    const nowSlot = duration > 0 ? Math.floor(now / duration) : 0
    let committed = now < Number(ledger.carry_expires) ? carry : 0
    let occupied = 0
    for (const slot of ledger.slots) {
        const index = Number(slot.slot)
        const bytes = Number(slot.bytes)
        if (!Number.isFinite(index) || !Number.isFinite(bytes) || bytes < 0) {
            problems.push(`slot {${slot.slot}, ${slot.bytes}} is not a sane entry`)
            continue
        }
        if (duration > 0 && index > nowSlot) {
            problems.push(`slot index ${index} lies in the future (current slot ${nowSlot})`)
        }
        if (nowSlot - index < RING_SLOTS && bytes > 0) {
            committed += bytes
            occupied += 1
        }
    }
    if (committed > quota) {
        problems.push(`committed ${committed} exceeds the ${quota}-byte quota`)
    }

    console.log('\nring state:')
    const agreement =
        chainDuration === undefined
            ? ''
            : duration === chainDuration
              ? ' (matches powup.state)'
              : ` (powup.state expects ${chainDuration}; the next transfer carries the ring forward)`
    console.log(`  duration:       ${duration} seconds per bucket${agreement}`)
    console.log(`  slots:          ${ledger.slots.length} (${occupied} occupied)`)
    console.log(`  carry:          ${carry} bytes`)
    console.log(`  committed:      ${committed} bytes`)
    return {committed, problems}
}

try {
    const floor = artifactFloor()
    let required = floor

    const account = await client.v1.chain.get_account(powerAccount)
    const usage = Number(account.ram_usage)
    const quota = Number(account.ram_quota)
    console.log('\nlive account:')
    console.log(`  ram usage:      ${usage} bytes`)
    console.log(`  ram quota:      ${quota} bytes`)
    console.log(`  headroom:       ${quota - usage} bytes`)

    let config: any
    try {
        config = await getRow(powerAccount, powerAccount, 'config')
    } catch {
        const recommended = Math.ceil((required * (100 + MARGIN_PERCENT)) / 100)
        console.log('\nno contract tables on the account yet; treating this as a first install')
        console.log(`when running configure, set cushion_bytes to at least ${recommended}`)
        process.exit(0)
    }

    // The ABI is live past this point, so a ledger read failure means the stored row no longer decodes
    let ledger: any
    try {
        ledger = await getRow(powerAccount, powerAccount, 'ledger')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`\nFAILED: the ledger row no longer decodes under the deployed ABI: ${message}`)
        console.log(
            'the stored row predates a layout change; clear the ledger singleton before serving traffic'
        )
        process.exit(1)
    }

    if (ledger === undefined) {
        console.log('\nring state:   no ledger row yet (no transfers served)')
    } else {
        const {committed, problems} = ringState(ledger, quota, await expectedDuration())
        if (problems.length > 0) {
            console.log(
                '\nFAILED: the stored ledger row is not consistent with the deployed contract:'
            )
            for (const problem of problems) console.log(`  - ${problem}`)
            console.log(
                'the row likely predates a layout change; clear the ledger singleton before serving traffic'
            )
            process.exit(1)
        }
        const footprint = usage - committed
        console.log(`  footprint:      ${footprint} bytes (usage minus committed)`)
        required = Math.max(required, footprint)
    }

    const recommended = Math.ceil((required * (100 + MARGIN_PERCENT)) / 100)
    console.log('\ncushion requirement:')
    console.log(`  required:       ${required} bytes`)
    console.log(`  recommended:    ${recommended} bytes (${MARGIN_PERCENT}% margin)`)

    if (config === undefined) {
        console.log('\nthe "config" singleton is empty; the contract is inert until configure runs')
        console.log(`when running configure, set cushion_bytes to at least ${recommended}`)
        process.exit(0)
    }

    const cushion = Number(config.cushion_bytes)
    console.log(`  configured:     ${cushion} bytes`)
    if (cushion < required) {
        console.log(`\nFAILED: cushion_bytes ${cushion} is below the ${required}-byte footprint`)
        console.log('the contract will under-buy RAM and eventually reject user transactions')
        console.log(`fix: rerun configure with cushion_bytes at ${recommended} or higher`)
        process.exit(1)
    }
    const margin = (((cushion - required) / required) * 100).toFixed(1)
    if (cushion < recommended) {
        console.log(
            `\nWARNING: only ${margin}% margin over the footprint, below the ${MARGIN_PERCENT}% target`
        )
        console.log(`consider rerunning configure with cushion_bytes at ${recommended} or higher`)
        process.exit(0)
    }
    console.log(`\nOK: cushion covers the footprint with ${margin}% margin`)
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`\ncheck FAILED: ${message}`)
    process.exit(1)
}
