import {beforeEach, describe, expect, test} from 'bun:test'
import {Asset} from '@wharfkit/antelope'

import {
    alice,
    bob,
    contracts,
    defaultFeesAccount,
    defaultInitialBalance,
    defaultRegistryConfig,
    defaultSystemTokenSymbol,
    getTokenBalance,
    registryContract,
    resetContracts,
    tokensContract,
} from '../helpers'

function expectDefaultConfig(config) {
    expect(config.fees.token.contract).toBe('core.vaulta')
    expect(config.fees.token.symbol).toBe('4,A')
    expect(config.fees.receiver).toBe('eosio.fees')
    expect(config.fees.regtoken).toBe('1.0000 A')
    expect(config.regtoken.minlength).toBe(1)
}

describe(`contract: ${registryContract}`, () => {
    beforeEach(async () => {
        await resetContracts()
    })

    describe('user', () => {
        describe('notify: on_transfer', () => {
            describe('success', () => {
                test('deposit funds', async () => {
                    const balance = getTokenBalance(alice)
                    expect(balance.equals(defaultInitialBalance)).toBeTrue()

                    // Initial deposit
                    await contracts.token.actions
                        .transfer([alice, registryContract, '5.0000 A', ''])
                        .send(alice)
                    let rows = await contracts.registry.tables.balance().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].account).toBe(alice)
                    expect(rows[0].balance).toBe('5.0000 A')

                    // Ensure balance deducted correctly
                    const balanceAfterDeposit1 = getTokenBalance(alice)
                    const expectedBalanceAfterDeposit1 = defaultInitialBalance.units.subtracting(
                        Asset.fromFloat(5, defaultSystemTokenSymbol).units
                    )
                    expect(
                        balanceAfterDeposit1.units.equals(expectedBalanceAfterDeposit1)
                    ).toBeTrue()

                    // Additional deposit
                    await contracts.token.actions
                        .transfer([alice, registryContract, '3.0000 A', ''])
                        .send(alice)
                    rows = await contracts.registry.tables.balance().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].account).toBe(alice)
                    expect(rows[0].balance).toBe('8.0000 A')

                    // Ensure balance deducted correctly
                    const balanceAfterDeposit2 = getTokenBalance(alice)
                    const expectedBalanceAfterDeposit2 = expectedBalanceAfterDeposit1.subtracting(
                        Asset.fromFloat(3, defaultSystemTokenSymbol).units
                    )
                    expect(
                        balanceAfterDeposit2.units.equals(expectedBalanceAfterDeposit2)
                    ).toBeTrue()
                })
            })
            describe('error', () => {
                test('contract disabled', async () => {
                    await contracts.registry.actions.reset().send()
                    expect(
                        contracts.token.actions
                            .transfer([alice, registryContract, '5.0000 A', ''])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: contract is disabled')
                })
                test('reject incorrect token contract', async () => {
                    await expect(
                        contracts.faketoken.actions
                            .transfer([alice, registryContract, '5.0000 A', ''])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: Incorrect token contract for deposit.')
                })
                test('reject incorrect token symbol', async () => {
                    await expect(
                        contracts.token.actions
                            .transfer([alice, registryContract, '5.0000 B', ''])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: Incorrect token symbol for deposit.')
                })
                test('reject deposit without an open balance', async () => {
                    await expect(
                        contracts.token.actions
                            .transfer([bob, registryContract, '5.0000 A', ''])
                            .send(bob)
                    ).rejects.toThrow(
                        'eosio_assert: no balance for account, call openbalance first'
                    )
                })
            })
        })
        describe('action: withdraw', () => {
            describe('success', () => {
                test('withdraw funds', async () => {
                    const balance = getTokenBalance(alice)
                    expect(balance.equals(defaultInitialBalance)).toBeTrue()

                    // Deposit funds first
                    await contracts.token.actions
                        .transfer([alice, registryContract, '10.0000 A', ''])
                        .send(alice)

                    // Ensure contract balance updated correctly
                    const rowsAfterDeposit = await contracts.registry.tables
                        .balance()
                        .getTableRows()
                    expect(rowsAfterDeposit).toHaveLength(1)
                    expect(rowsAfterDeposit[0].account).toBe(alice)
                    expect(rowsAfterDeposit[0].balance).toBe('10.0000 A')

                    // Ensure account balance deducted correctly
                    const balanceAfterDeposit1 = getTokenBalance(alice)
                    const expectedBalanceAfterDeposit1 = defaultInitialBalance.units.subtracting(
                        Asset.fromFloat(10, defaultSystemTokenSymbol).units
                    )
                    expect(
                        balanceAfterDeposit1.units.equals(expectedBalanceAfterDeposit1)
                    ).toBeTrue()

                    // Withdraw funds from contract
                    await contracts.registry.actions.withdraw([alice, '4.0000 A']).send(alice)

                    // Ensure contract balance updated correctly
                    const rowsAfterWithdraw = await contracts.registry.tables
                        .balance()
                        .getTableRows()
                    expect(rowsAfterWithdraw).toHaveLength(1)
                    expect(rowsAfterWithdraw[0].account).toBe(alice)
                    expect(rowsAfterWithdraw[0].balance).toBe('6.0000 A')

                    // Verify token balance updated correctly
                    const balanceAfterWithdraw = getTokenBalance(alice)
                    const expectedBalanceAfterWithdraw = defaultInitialBalance.units
                        .subtracting(Asset.fromFloat(10, defaultSystemTokenSymbol).units)
                        .adding(Asset.fromFloat(4, defaultSystemTokenSymbol).units)
                    expect(
                        balanceAfterWithdraw.units.equals(expectedBalanceAfterWithdraw)
                    ).toBeTrue()
                })
            })
            describe('error', () => {
                test('contract disabled', async () => {
                    await contracts.registry.actions.reset().send()
                    await expect(
                        contracts.registry.actions.withdraw([alice, '1.0000 FOO']).send(alice)
                    ).rejects.toThrow('eosio_assert: contract is disabled')
                })
                test('no contract balance', async () => {
                    await expect(
                        contracts.registry.actions.withdraw([bob, '100.0000 A']).send(bob)
                    ).rejects.toThrow('eosio_assert: no contract balance for account')
                })
                test('insufficient contract balance', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '10.0000 A', ''])
                        .send(alice)
                    await expect(
                        contracts.registry.actions.withdraw([alice, '10.0001 A']).send(alice)
                    ).rejects.toThrow('eosio_assert: insufficient contract balance')
                })
                test('incorrect token symbol', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '10.0000 A', ''])
                        .send(alice)
                    await expect(
                        contracts.registry.actions.withdraw([alice, '5.0000 B']).send(alice)
                    ).rejects.toThrow('eosio_assert: Incorrect token symbol for withdraw')
                })
            })
        })
        describe('action: regtoken', () => {
            describe('success', () => {
                test('register token', async () => {
                    const balance = getTokenBalance(alice)
                    expect(balance.equals(defaultInitialBalance)).toBeTrue()

                    await contracts.registry.actions
                        .setconfig([
                            {
                                ...defaultRegistryConfig,
                                fees: {
                                    ...defaultRegistryConfig.fees,
                                    regtoken: Asset.fromFloat(20, defaultSystemTokenSymbol),
                                },
                            },
                        ])
                        .send()

                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)

                    // Ensure contract balance updated correctly
                    const balanceAfter = getTokenBalance(alice)
                    expect(
                        balanceAfter.units.equals(
                            defaultInitialBalance.units.subtracting(
                                Asset.fromFloat(50, defaultSystemTokenSymbol).units
                            )
                        )
                    ).toBeTrue()

                    // Ensure fee balance before transfer
                    const feeBalanceBefore = getTokenBalance(defaultFeesAccount)
                    expect(
                        feeBalanceBefore.equals(Asset.fromUnits(0, defaultSystemTokenSymbol))
                    ).toBeTrue()

                    // Register the token
                    await contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '20.0000 A'])
                        .send(alice)

                    // Ensure token registered correctly
                    const rows = await contracts.registry.tables.tokens().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].contract).toBeNull()
                    expect(rows[0].ticker).toBe('FOO')
                    expect(rows[0].precision).toBe(2)
                    expect(rows[0].creator).toBe(alice)

                    // Ensure contract balance deducted correctly
                    const contractBalance = await contracts.registry.tables.balance().getTableRows()
                    expect(contractBalance).toHaveLength(1)
                    expect(contractBalance[0].account).toBe(alice)
                    expect(contractBalance[0].balance).toBe('30.0000 A')

                    // Ensure the fee was transferred to the fee account
                    const feeBalanceAfter = getTokenBalance(defaultFeesAccount)
                    expect(
                        feeBalanceAfter.units.equals(
                            Asset.fromFloat(20, defaultSystemTokenSymbol).units
                        )
                    ).toBeTrue()
                })
            })
            describe('error', () => {
                test('contract disabled', async () => {
                    await contracts.registry.actions.reset().send()
                    // Attempt to register token
                    await expect(
                        contracts.registry.actions
                            .regtoken([alice, 'FOO', 2, '1.0000 A'])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: contract is disabled')
                })
                test('incorrect payment symbol', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)
                    await expect(
                        contracts.registry.actions
                            .regtoken([alice, 'FOO', 2, '1.0000 B'])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: incorrect payment symbol')
                })
                test('incorrect payment amount', async () => {
                    await expect(
                        contracts.registry.actions
                            .regtoken([alice, 'FOO', 2, '2.0000 A'])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: incorrect payment amount')
                })
                test('incorrect precision', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)
                    await expect(
                        contracts.registry.actions
                            .regtoken([alice, 'FOO', 19, '1.0000 A'])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: Precision must be less than or equal to 18')
                })
                test('incorrect payment amount', async () => {
                    await contracts.registry.actions
                        .setconfig([
                            {
                                ...defaultRegistryConfig,
                                fees: {
                                    ...defaultRegistryConfig.fees,
                                    regtoken: Asset.fromFloat(20, defaultSystemTokenSymbol),
                                },
                            },
                        ])
                        .send()

                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)

                    const balance = getTokenBalance(alice)
                    expect(
                        balance.units.equals(
                            defaultInitialBalance.units.subtracting(
                                Asset.fromFloat(50, defaultSystemTokenSymbol).units
                            )
                        )
                    ).toBeTrue()

                    const rows = await contracts.registry.tables.balance().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].account).toBe(alice)
                    expect(rows[0].balance).toBe('50.0000 A')

                    await expect(
                        contracts.registry.actions
                            .regtoken([alice, 'FOO', 2, '30.0000 A'])
                            .send(alice)
                    ).rejects.toThrow('eosio_assert: incorrect payment amount')
                })
                test('insufficient contract balance to pay fee', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '0.0001 A', ''])
                        .send(alice)

                    const balance = getTokenBalance(alice)
                    expect(
                        balance.units.equals(
                            defaultInitialBalance.units.subtracting(
                                Asset.fromFloat(0.0001, defaultSystemTokenSymbol).units
                            )
                        )
                    ).toBeTrue()

                    await expect(
                        contracts.registry.actions
                            .regtoken([alice, 'FOO', 2, '1.0000 A'])
                            .send(alice)
                    ).rejects.toThrow(
                        'eosio_assert: insufficient contract balance to pay registration fee'
                    )
                })
                test('prevent duplicate token symbol registration', async () => {
                    await contracts.registry.actions.setconfig([defaultRegistryConfig]).send()
                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)

                    // Register the token
                    await contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '1.0000 A'])
                        .send(alice)

                    // Ensure token registered correctly
                    const rows = await contracts.registry.tables.tokens().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].contract).toBeNull()
                    expect(rows[0].ticker).toBe('FOO')
                    expect(rows[0].creator).toBe(alice)

                    // Try registering a duplicate
                    const action = contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '1.0000 A'])
                        .send(alice)
                    expect(action).rejects.toThrow('eosio_assert: token is already registered')
                })
                test('requires minimum ticker length', async () => {
                    await contracts.registry.actions
                        .setconfig([{...defaultRegistryConfig, regtoken: {minlength: 3}}])
                        .send()

                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)

                    // Try registering a token with a short ticker
                    const action = contracts.registry.actions
                        .regtoken([alice, 'F', 2, '1.0000 A'])
                        .send(alice)
                    expect(action).rejects.toThrow('eosio_assert: token ticker is too short')

                    // Try registering a token with a short ticker
                    const action2 = contracts.registry.actions
                        .regtoken([alice, 'FO', 2, '1.0000 A'])
                        .send(alice)
                    expect(action2).rejects.toThrow('eosio_assert: token ticker is too short')

                    // Try registering a token with an appropriate ticker
                    await contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '1.0000 A'])
                        .send(alice)
                })
            })
        })
        describe('action: setcontract', () => {
            describe('success', () => {
                test('set token contract', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)
                    await contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '1.0000 A'])
                        .send(alice)
                    await contracts.registry.actions
                        .setcontract(['FOO', tokensContract])
                        .send(alice)
                    const rows = await contracts.registry.tables.tokens().getTableRows()
                    expect(rows).toHaveLength(1)
                    const token = rows[0]
                    expect(token.contract).toBe(tokensContract)
                    expect(token.ticker).toBe('FOO')
                    expect(token.creator).toBe(alice)
                })
            })
            describe('error', () => {
                test('requires auth of creator', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)
                    await contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '1.0000 A'])
                        .send(alice)
                    const action = contracts.registry.actions
                        .setcontract(['FOO', tokensContract])
                        .send(bob)
                    expect(action).rejects.toThrow('missing required authority alice')
                })
                test('cannot call on non-existing token', async () => {
                    const action = contracts.registry.actions
                        .setcontract(['FOO', tokensContract])
                        .send(alice)
                    expect(action).rejects.toThrow('eosio_assert: token is not registered')
                })
                test('cannot call twice on the same token', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)
                    await contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '1.0000 A'])
                        .send(alice)
                    await contracts.registry.actions
                        .setcontract(['FOO', tokensContract])
                        .send(alice)
                    const action = contracts.registry.actions
                        .setcontract(['FOO', tokensContract])
                        .send(alice)
                    expect(action).rejects.toThrow(
                        'eosio_assert: token contract has already been set'
                    )
                })
                test('cannot set contract if not whitelisted', async () => {
                    await contracts.token.actions
                        .transfer([alice, registryContract, '50.0000 A', ''])
                        .send(alice)
                    await contracts.registry.actions
                        .regtoken([alice, 'FOO', 2, '1.0000 A'])
                        .send(alice)
                    const action = contracts.registry.actions
                        .setcontract(['FOO', 'foo.token'])
                        .send(alice)
                    expect(action).rejects.toThrow('eosio_assert: contract is not whitelisted')
                })
            })
        })
    })

    describe('admin', () => {
        describe('action: enable', () => {
            describe('success', () => {
                test('set enabled state', async () => {
                    await contracts.registry.actions.reset().send()
                    await contracts.registry.actions.setconfig([defaultRegistryConfig]).send()
                    await contracts.registry.actions.enable().send()
                    const rows = await contracts.registry.tables.config().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].enabled).toBeTrue()
                })
            })
            describe('error', () => {
                test('require contract auth', async () => {
                    const action = contracts.registry.actions.enable().send(alice)
                    expect(action).rejects.toThrow('missing required authority registry')
                })
                test('requires configuration to be set before enabling', async () => {
                    await contracts.registry.actions.reset().send()
                    const action = contracts.registry.actions.enable().send()
                    expect(action).rejects.toThrow('eosio_assert: fees.token symbol must be set')
                })
            })
        })
        describe('action: disable', () => {
            describe('success', () => {
                test('set disabled state', async () => {
                    await contracts.registry.actions.disable().send()
                    const rows = await contracts.registry.tables.config().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].enabled).toBeFalse()
                })
            })
            describe('error', () => {
                test('require contract auth', async () => {
                    const action = contracts.registry.actions.disable().send(alice)
                    expect(action).rejects.toThrow('missing required authority registry')
                })
            })
        })
        describe('action: setconfig', () => {
            describe('success', () => {
                test('setting config', async () => {
                    await contracts.registry.actions.reset().send()
                    await contracts.registry.actions.setconfig([defaultRegistryConfig]).send()
                    const rows = await contracts.registry.tables.config().getTableRows()
                    expect(rows).toHaveLength(1)
                    expectDefaultConfig(rows[0])
                })
                test('modifying enabled state maintains config data', async () => {
                    // Initial set with full config but disabled
                    await contracts.registry.actions.reset().send()
                    await contracts.registry.actions.setconfig([defaultRegistryConfig]).send()
                    const rows = await contracts.registry.tables.config().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].enabled).toBeTrue()
                    expectDefaultConfig(rows[0])

                    await contracts.registry.actions.disable().send()
                    const disabledRows = await contracts.registry.tables.config().getTableRows()
                    expect(disabledRows).toHaveLength(1)
                    expect(disabledRows[0].enabled).toBeFalse()
                    expectDefaultConfig(disabledRows[0])

                    // Modify enabled state only
                    await contracts.registry.actions.enable().send()
                    const enabledRows = await contracts.registry.tables.config().getTableRows()
                    expect(enabledRows).toHaveLength(1)
                    expect(enabledRows[0].enabled).toBeTrue()
                    expectDefaultConfig(enabledRows[0])
                })
            })
            describe('error', () => {
                test('require contract auth', async () => {
                    await contracts.registry.actions.reset().send()
                    const action = contracts.registry.actions
                        .setconfig([defaultRegistryConfig])
                        .send(alice)
                    expect(action).rejects.toThrow('missing required authority registry')
                })
            })
        })
        describe('action: addcontract', () => {
            describe('success', () => {
                test('add token contracts', async () => {
                    await contracts.registry.actions.reset().send()
                    await contracts.registry.actions.addcontract(['foo.token']).send()
                    await contracts.registry.actions.addcontract(['bar.token']).send()
                    const rows = await contracts.registry.tables.contracts().getTableRows()
                    expect(rows).toHaveLength(2)
                    const accounts = rows.map((r) => r.account)
                    expect(accounts).toContain('foo.token')
                    expect(accounts).toContain('bar.token')
                })
            })
            describe('error', () => {
                test('require contract auth', async () => {
                    const action = contracts.registry.actions.addcontract(['foo.token']).send(alice)
                    expect(action).rejects.toThrow('missing required authority registry')
                })
                test('prevent duplicate contract', async () => {
                    const action = contracts.registry.actions.addcontract([tokensContract]).send()
                    expect(action).rejects.toThrow('eosio_assert: contract is already registered')
                })
            })
        })
        describe('action: addtoken', () => {
            describe('success', () => {
                test('add token', async () => {
                    await contracts.registry.actions.addtoken([alice, 'EOS', 4]).send()
                    const rows = await contracts.registry.tables.tokens().getTableRows()
                    expect(rows).toHaveLength(1)
                    expect(rows[0].contract).toBeNull()
                    expect(rows[0].ticker).toBe('EOS')
                    expect(rows[0].precision).toBe(4)
                    expect(rows[0].creator).toBe(alice)
                })
                test('add multiple tokens', async () => {
                    await contracts.registry.actions.addtoken([alice, 'EOS', 4]).send()
                    await contracts.registry.actions.addtoken([alice, 'FOO', 2]).send()
                    const rows = await contracts.registry.tables.tokens().getTableRows()
                    expect(rows).toHaveLength(2)

                    const token1 = rows.find((r) => r.ticker === 'EOS')
                    expect(token1).toBeDefined()

                    const token2 = rows.find((r) => r.ticker === 'FOO')
                    expect(token2).toBeDefined()
                })
            })
            describe('error', () => {
                test('require contract auth', async () => {
                    const action = contracts.registry.actions
                        .addtoken([alice, 'EOS', 4])
                        .send(alice)
                    expect(action).rejects.toThrow('missing required authority registry')
                })
                test('prevent duplicate contract/symbol', async () => {
                    await contracts.registry.actions.addtoken([alice, 'EOS', 4]).send()
                    const action = contracts.registry.actions.addtoken([alice, 'EOS', 4]).send()
                    expect(action).rejects.toThrow('eosio_assert: token is already registered')
                })
            })
        })
        describe('action: rmcontract', () => {
            describe('success', () => {
                test('remove contract', async () => {
                    await contracts.registry.actions.addcontract(['eosio.token']).send()
                    const rows1 = await contracts.registry.tables.contracts().getTableRows()
                    expect(rows1).toHaveLength(2)

                    await contracts.registry.actions.rmcontract(['eosio.token']).send()
                    const rows2 = await contracts.registry.tables.contracts().getTableRows()
                    expect(rows2).toHaveLength(1)
                })
            })
            describe('error', () => {
                test('require contract auth', async () => {
                    const action = contracts.registry.actions
                        .rmcontract(['eosio.token'])
                        .send(alice)
                    expect(action).rejects.toThrow('missing required authority registry')
                })
                test('prevent removing non-existent contract', async () => {
                    const action = contracts.registry.actions.rmcontract(['eosio.token']).send()
                    expect(action).rejects.toThrow('eosio_assert: contract not found')
                })
            })
        })
        describe('action: rmtoken', () => {
            describe('success', () => {
                test('remove token', async () => {
                    await contracts.registry.actions
                        .addtoken([registryContract, 'EOS', 4])
                        .send(registryContract)
                    const rowsBefore = await contracts.registry.tables.tokens().getTableRows()
                    expect(rowsBefore).toHaveLength(1)

                    await contracts.registry.actions.rmtoken(['EOS']).send(registryContract)

                    const rowsAfter = await contracts.registry.tables.tokens().getTableRows()
                    expect(rowsAfter).toHaveLength(0)
                })
            })
            describe('error', () => {
                test('require contract auth', async () => {
                    const action = contracts.registry.actions.rmtoken(['EOS']).send(alice)
                    expect(action).rejects.toThrow('missing required authority registry')
                })
            })
        })
    })
})
