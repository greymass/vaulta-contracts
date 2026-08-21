import {Blockchain} from '@greymass/vert'
import {Asset, Name, TimePointSec} from '@wharfkit/antelope'

import * as TokenContract from '../codegen/token.ts'

export const blockchain = new Blockchain()
export const alice = 'alice'
export const bob = 'bob'

export const apiContract = 'api'
export const faketokenContract = 'fake.token'
export const feereceiver = 'eosio.fees'
export const mockreceiverContract = 'mockreceiver'
export const registryContract = 'registry'
export const systemtokenContract = 'core.vaulta'
export const tokensContract = 'tokens'

export const defaultSystemTokenSymbol = '4,A'
export const defaultFeesAccount = 'eosio.fees'
export const defaultInitialBalance = Asset.fromFloat(1000, defaultSystemTokenSymbol)

export const defaultRegistryConfig = {
    enabled: true,
    fees: {
        token: {
            contract: systemtokenContract,
            symbol: defaultSystemTokenSymbol,
        },
        receiver: 'eosio.fees',
        regtoken: Asset.fromFloat(1, defaultSystemTokenSymbol),
    },
    regtoken: {
        minlength: 1,
    },
}

export const contracts = {
    api: blockchain.createContract(apiContract, `./contracts/api/build/api`, true),
    faketoken: blockchain.createContract(
        faketokenContract,
        './shared/include/eosio.token/eosio.token',
        true
    ),
    mockreceiver: blockchain.createContract(
        mockreceiverContract,
        `./contracts/mockreceiver/build/mockreceiver`,
        true
    ),
    registry: blockchain.createContract(
        registryContract,
        `./contracts/registry/build/registry`,
        true
    ),
    token: blockchain.createContract(
        systemtokenContract,
        './shared/include/eosio.token/eosio.token',
        true
    ),
    tokens: blockchain.createContract(tokensContract, './contracts/tokens/build/tokens', true),
}

export async function resetContracts() {
    await blockchain.resetTables()
    blockchain.createAccounts(alice, bob, defaultFeesAccount)

    // System token setup
    const supply = Asset.fromFloat(1000000000, defaultSystemTokenSymbol)
    await contracts.token.actions.create([systemtokenContract, String(supply)]).send()
    await contracts.token.actions.issue([systemtokenContract, String(supply), '']).send()

    await contracts.token.actions
        .transfer([systemtokenContract, 'alice', String(defaultInitialBalance), ''])
        .send()
    await contracts.token.actions
        .transfer([systemtokenContract, 'bob', String(defaultInitialBalance), ''])
        .send()
    await contracts.token.actions
        .open([defaultFeesAccount, defaultSystemTokenSymbol, defaultFeesAccount])
        .send('eosio.fees')

    // Secondary token on primary contract for testing
    const secondarySupply = Asset.fromFloat(1000000000, '4,B')
    await contracts.token.actions.create([systemtokenContract, String(secondarySupply)]).send()
    await contracts.token.actions.issue([systemtokenContract, String(secondarySupply), '']).send()
    await contracts.token.actions.transfer([systemtokenContract, 'alice', '1000.0000 B', '']).send()

    // Fake token contract mimicing system token for testing
    const fakesupply = `1000000000.0000 A`
    await contracts.faketoken.actions.create(['fake.token', fakesupply]).send()
    await contracts.faketoken.actions.issue(['fake.token', fakesupply, '']).send()
    await contracts.faketoken.actions.transfer(['fake.token', alice, '1000.0000 A', '']).send()
    await contracts.faketoken.actions.transfer(['fake.token', bob, '1000.0000 A', '']).send()

    // Set base configuration for testing
    await setRegistryConfig()
    await setTokensConfig()

    // The registry never pays for balance rows, so accounts must open one before depositing
    await contracts.registry.actions.openbalance([alice]).send(alice)
}

export function advanceTime(seconds: number) {
    const newDate = new Date(blockchain.timestamp.toMilliseconds() + seconds * 1000)
    blockchain.setTime(TimePointSec.from(newDate))
}

export async function setRegistryConfig() {
    await contracts.registry.actions.setconfig([defaultRegistryConfig]).send()
    await contracts.registry.actions.addcontract([tokensContract]).send()
    await contracts.registry.actions.enable().send()
}

export async function setTokensConfig() {
    await contracts.tokens.actions.setconfig([registryContract]).send()
}

export function getTokenBalance(
    account: string,
    contract: string = 'token',
    symbol: string = defaultSystemTokenSymbol
) {
    const scope = Name.from(account).value.value
    const primary_key = Asset.Symbol.from(symbol).code.value.value
    const row = contracts[contract].tables
        .accounts(scope)
        .getTableRow(primary_key) as TokenContract.Types.account
    if (!row) throw new Error('Balance not found')
    return Asset.from(row.balance)
}
