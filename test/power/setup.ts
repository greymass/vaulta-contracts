import {Asset, Name, TimePointSec} from '@wharfkit/antelope'

import {blockchain} from '../helpers'

export const powerContract = 'power.gm'
export const systemContract = 'eosio'
export const systemTokenContract = 'eosio.token'
export const alice = 'alice'
export const bob = 'bob'
export const longName = 'atticlabeosb1'

export const systemTokenSymbol = '4,A'

// Hardcoded in the vendored eosio.system wasm, so the harness has to provide them
export const systemAccounts = [
    'eosio.ram',
    'eosio.ramfee',
    'eosio.rex',
    'eosio.reserv',
    'eosio.stake',
    'eosio.fees',
]

export const powerupDays = 1

export const contracts = {
    system: blockchain.createContract(
        systemContract,
        './shared/include/eosio.system/eosio.system',
        true,
        {privileged: true}
    ),
    token: blockchain.createContract(
        systemTokenContract,
        './shared/include/eosio.token/eosio.token',
        true
    ),
    faketoken: blockchain.createContract(
        'fake.token',
        './shared/include/eosio.token/eosio.token',
        true
    ),
    power: blockchain.createContract(powerContract, './contracts/power/build/power', true),
}

export function tokenBalance(account: string): number {
    const scope = Name.from(account).value.value
    const primary = Asset.Symbol.from(systemTokenSymbol).code.value.value
    const row = contracts.token.tables.accounts(scope).getTableRow(primary)
    return row ? Number(Asset.from(row.balance).units) : 0
}

export async function measureTransfer(sender: string, amount: string, memo = '') {
    const senderBefore = tokenBalance(sender)
    const feesBefore = tokenBalance('eosio.fees')
    const ramBefore = tokenBalance('eosio.ram')
    await contracts.token.actions.transfer([sender, powerContract, amount, memo]).send(sender)
    return {
        senderSpent: senderBefore - tokenBalance(sender),
        feesGained: tokenBalance('eosio.fees') - feesBefore,
        ramGained: tokenBalance('eosio.ram') - ramBefore,
    }
}

export function orderCount(): number {
    return contracts.system.tables['powup.order'](BigInt(0)).getTableRows().length
}

export function ledgerRow() {
    const scope = Name.from(powerContract).value.value
    return contracts.power.tables.ledger(scope).getTableRows()[0]
}

export function committedBytes(): number {
    const row = ledgerRow()
    if (!row) return 0
    const carry = row.carry_bytes === undefined ? 0 : Number(row.carry_bytes)
    return row.slots.reduce((sum, slot) => sum + Number(slot.bytes), carry)
}

export function occupiedSlots() {
    return ledgerRow().slots.filter((slot) => Number(slot.bytes) > 0)
}

export async function setPowerupDays(days: number) {
    await contracts.system.actions
        .cfgpowerup([
            {
                net: powerupResourceConfig(),
                cpu: powerupResourceConfig(),
                powerup_days: days,
                min_powerup_fee: Asset.fromFloat(0.0001, systemTokenSymbol),
            },
        ])
        .send(systemContract)
}

export function powerupState() {
    return contracts.system.tables['powup.state'](BigInt(0)).getTableRows()[0]
}

function powerupResourceConfig() {
    const targetTimestamp = new Date(blockchain.timestamp.toMilliseconds() + 365 * 86400 * 1000)
    return {
        current_weight_ratio: 10000000000000,
        target_weight_ratio: 10000000000000,
        assumed_stake_weight: 1000000000000,
        target_timestamp: TimePointSec.from(targetTimestamp),
        exponent: 2,
        decay_secs: 86400,
        min_price: Asset.fromFloat(0, systemTokenSymbol),
        max_price: Asset.fromFloat(1000000, systemTokenSymbol),
    }
}

export async function resetContracts() {
    await blockchain.resetTables()
    blockchain.createAccounts(alice, bob, longName, ...systemAccounts)

    const supply = Asset.fromFloat(1000000000, systemTokenSymbol)
    await contracts.token.actions.create([systemTokenContract, String(supply)]).send()
    await contracts.token.actions.issue([systemTokenContract, String(supply), '']).send()

    await contracts.system.actions.init([0, systemTokenSymbol]).send(systemContract)
    await contracts.system.actions
        .cfgpowerup([
            {
                net: powerupResourceConfig(),
                cpu: powerupResourceConfig(),
                powerup_days: powerupDays,
                min_powerup_fee: Asset.fromFloat(0.0001, systemTokenSymbol),
            },
        ])
        .send(systemContract)

    for (const account of [alice, bob]) {
        await contracts.token.actions
            .transfer([systemTokenContract, account, '1000.0000 A', ''])
            .send(systemTokenContract)
    }

    const fakeSupply = Asset.fromFloat(1000000000, systemTokenSymbol)
    await contracts.faketoken.actions.create(['fake.token', String(fakeSupply)]).send()
    await contracts.faketoken.actions.issue(['fake.token', String(fakeSupply), '']).send()
    await contracts.faketoken.actions.transfer(['fake.token', alice, '1000.0000 A', '']).send()
}

export const defaultRail = {
    token_contract: systemTokenContract,
    token_symbol: systemTokenSymbol,
    powerup_contract: systemContract,
}

export const defaultConfig = {
    rails: [defaultRail],
    cpu_frac: 10000000000,
    net_frac: 1000000000,
    order_bytes: 405,
    userres_bytes: 272,
    cushion_bytes: 500000,
}

export async function configure(overrides = {}) {
    const config = {...defaultConfig, ...overrides}
    await contracts.power.actions
        .configure([
            config.rails,
            config.cpu_frac,
            config.net_frac,
            config.order_bytes,
            config.userres_bytes,
            config.cushion_bytes,
        ])
        .send(powerContract)
}
