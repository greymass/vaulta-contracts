import {beforeEach, describe, expect, test} from 'bun:test'

import {
    alice,
    bob,
    contracts,
    createTopic,
    defaultTokenSymbol,
    depositTokens,
    resetContracts,
    sentimentContract,
    topicFee,
} from './setup'
import {Asset} from '@wharfkit/antelope'

describe('contract: sentiment - Topic Management', () => {
    beforeEach(async () => {
        await resetContracts()
    })

    describe('action: createtopic', () => {
        describe('success', () => {
            test('create a topic', async () => {
                await createTopic(alice, 'testtopic', 'Test topic description')

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(1)
                expect(rows[0].id).toBe('testtopic')
                expect(rows[0].description).toBe('Test topic description')
                expect(rows[0].creator).toBe('alice')
            })

            test('create multiple topics', async () => {
                await createTopic(alice, 'topic1', 'First topic')
                await createTopic(bob, 'topic2', 'Second topic')
                await createTopic(alice, 'topic3', 'Third topic')

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(3)
                expect(rows[0].id).toBe('topic1')
                expect(rows[1].id).toBe('topic2')
                expect(rows[2].id).toBe('topic3')
            })

            test('contract authorization waives the fee', async () => {
                await contracts.sentiment.actions
                    .createtopic([
                        sentimentContract,
                        'testtopic',
                        'Test topic description',
                        String(topicFee),
                    ])
                    .send(sentimentContract)

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(1)
                expect(rows[0].creator).toBe(sentimentContract)

                const balanceRows = await contracts.sentiment.tables.balance().getTableRows()
                expect(balanceRows).toHaveLength(0)
            })

            test('contract authorization waives the fee for another creator', async () => {
                await depositTokens(alice, String(topicFee))

                await contracts.sentiment.actions
                    .createtopic([alice, 'testtopic', 'Test topic description', String(topicFee)])
                    .send([
                        {actor: alice, permission: 'active'},
                        {actor: sentimentContract, permission: 'active'},
                    ])

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(1)
                expect(rows[0].creator).toBe(alice)

                const balanceRows = await contracts.sentiment.tables.balance().getTableRows()
                expect(balanceRows).toHaveLength(1)
                expect(balanceRows[0].balance).toBe(String(topicFee))
            })

            test('fee is forwarded to receiver', async () => {
                await createTopic(alice, 'testtopic', 'Test topic description')

                const balanceRows = await contracts.sentiment.tables.balance().getTableRows()
                expect(balanceRows).toHaveLength(0)
            })
        })

        describe('error', () => {
            test('duplicate topic ID', async () => {
                await createTopic(alice, 'testtopic', 'First description')

                await depositTokens(alice, String(topicFee))
                await expect(
                    contracts.sentiment.actions
                        .createtopic([alice, 'testtopic', 'Second description', String(topicFee)])
                        .send(alice)
                ).rejects.toThrow('eosio_assert: topic with this ID already exists')
            })

            test('missing authorization', async () => {
                await depositTokens(alice, String(topicFee))
                await expect(
                    contracts.sentiment.actions
                        .createtopic([alice, 'testtopic', 'Test description', String(topicFee)])
                        .send('unauthorized')
                ).rejects.toThrow()
            })

            test('insufficient contract balance', async () => {
                await expect(
                    contracts.sentiment.actions
                        .createtopic([alice, 'testtopic', 'Test description', String(topicFee)])
                        .send(alice)
                ).rejects.toThrow(
                    'eosio_assert: insufficient contract balance to pay topic creation fee'
                )
            })

            test('incorrect payment amount', async () => {
                const wrongAmount = Asset.fromFloat(0.5, defaultTokenSymbol)
                await depositTokens(alice, String(topicFee))
                await expect(
                    contracts.sentiment.actions
                        .createtopic([alice, 'testtopic', 'Test description', String(wrongAmount)])
                        .send(alice)
                ).rejects.toThrow('eosio_assert: incorrect payment amount')
            })

            test('incorrect payment symbol', async () => {
                await depositTokens(alice, String(topicFee))
                await expect(
                    contracts.sentiment.actions
                        .createtopic([alice, 'testtopic', 'Test description', '1.0000 FAKE'])
                        .send(alice)
                ).rejects.toThrow('eosio_assert: incorrect payment symbol')
            })

            test('contract disabled', async () => {
                await contracts.sentiment.actions.disable().send(sentimentContract)
                await expect(
                    contracts.sentiment.actions
                        .createtopic([alice, 'testtopic', 'Test description', String(topicFee)])
                        .send(alice)
                ).rejects.toThrow('eosio_assert: contract is disabled')
            })
        })
    })

    describe('action: updatetopic', () => {
        describe('success', () => {
            test('update topic description', async () => {
                await createTopic(alice, 'testtopic', 'Original description')

                let rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows[0].description).toBe('Original description')

                await contracts.sentiment.actions
                    .updatetopic(['testtopic', 'Updated description'])
                    .send(sentimentContract)

                rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(1)
                expect(rows[0].id).toBe('testtopic')
                expect(rows[0].description).toBe('Updated description')
            })

            test('update does not affect topic ID', async () => {
                await createTopic(alice, 'testtopic', 'Original description')

                await contracts.sentiment.actions
                    .updatetopic(['testtopic', 'New description'])
                    .send(sentimentContract)

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows[0].id).toBe('testtopic')
            })
        })

        describe('error', () => {
            test('topic does not exist', async () => {
                await expect(
                    contracts.sentiment.actions
                        .updatetopic(['nonexistent', 'Some description'])
                        .send(sentimentContract)
                ).rejects.toThrow('eosio_assert: topic does not exist')
            })

            test('missing authorization', async () => {
                await createTopic(alice, 'testtopic', 'Original description')

                await expect(
                    contracts.sentiment.actions
                        .updatetopic(['testtopic', 'Updated description'])
                        .send('unauthorized')
                ).rejects.toThrow()
            })
        })
    })

    describe('action: deletetopic', () => {
        describe('success', () => {
            test('delete a topic', async () => {
                await createTopic(alice, 'testtopic', 'Test description')

                let rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(1)

                await contracts.sentiment.actions.deletetopic(['testtopic']).send(sentimentContract)

                rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(0)
            })

            test('delete one of multiple topics', async () => {
                await createTopic(alice, 'topic1', 'First topic')
                await createTopic(bob, 'topic2', 'Second topic')
                await createTopic(alice, 'topic3', 'Third topic')

                await contracts.sentiment.actions.deletetopic(['topic2']).send(sentimentContract)

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(2)
                expect(rows[0].id).toBe('topic1')
                expect(rows[1].id).toBe('topic3')
            })
        })

        describe('error', () => {
            test('topic does not exist', async () => {
                await expect(
                    contracts.sentiment.actions.deletetopic(['nonexistent']).send(sentimentContract)
                ).rejects.toThrow('eosio_assert: topic does not exist')
            })

            test('missing authorization', async () => {
                await createTopic(alice, 'testtopic', 'Test description')

                await expect(
                    contracts.sentiment.actions.deletetopic(['testtopic']).send('unauthorized')
                ).rejects.toThrow()
            })
        })
    })

    describe('read-only actions', () => {
        describe('action: gettopic', () => {
            describe('success', () => {
                test('get a single topic by id', async () => {
                    await createTopic(alice, 'testtopic', 'Test description')

                    const topic = await contracts.sentiment.actions.gettopic(['testtopic']).read()
                    expect(String(topic.id)).toBe('testtopic')
                    expect(topic.description).toBe('Test description')
                    expect(String(topic.creator)).toBe('alice')
                })

                test('get correct topic from multiple', async () => {
                    await createTopic(alice, 'topic1', 'First topic')
                    await createTopic(bob, 'topic2', 'Second topic')
                    await createTopic(alice, 'topic3', 'Third topic')

                    const topic = await contracts.sentiment.actions.gettopic(['topic2']).read()
                    expect(String(topic.id)).toBe('topic2')
                    expect(topic.description).toBe('Second topic')
                    expect(String(topic.creator)).toBe('bob')
                })
            })

            describe('error', () => {
                test('topic does not exist', async () => {
                    await expect(
                        contracts.sentiment.actions.gettopic(['nonexistent']).read()
                    ).rejects.toThrow('eosio_assert: topic does not exist')
                })
            })
        })

        describe('action: gettopics', () => {
            describe('success', () => {
                test('get all topics', async () => {
                    await createTopic(alice, 'topic1', 'First topic')
                    await createTopic(bob, 'topic2', 'Second topic')
                    await createTopic(alice, 'topic3', 'Third topic')

                    const topics = await contracts.sentiment.actions.gettopics().read()
                    expect(topics).toHaveLength(3)
                    expect(String(topics[0].id)).toBe('topic1')
                    expect(topics[0].description).toBe('First topic')
                    expect(String(topics[1].id)).toBe('topic2')
                    expect(topics[1].description).toBe('Second topic')
                    expect(String(topics[2].id)).toBe('topic3')
                    expect(topics[2].description).toBe('Third topic')
                })

                test('returns empty array when no topics exist', async () => {
                    const topics = await contracts.sentiment.actions.gettopics().read()
                    expect(topics).toHaveLength(0)
                })
            })
        })
    })

    describe('read operations via table', () => {
        describe('success', () => {
            test('read a single topic', async () => {
                await createTopic(alice, 'testtopic', 'Test description')

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(1)
                expect(rows[0].id).toBe('testtopic')
                expect(rows[0].description).toBe('Test description')
            })

            test('read correct topic from multiple', async () => {
                await createTopic(alice, 'topic1', 'First topic')
                await createTopic(bob, 'topic2', 'Second topic')
                await createTopic(alice, 'topic3', 'Third topic')

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(3)
                const topic2 = rows.find((r) => r.id === 'topic2')
                expect(topic2?.id).toBe('topic2')
                expect(topic2?.description).toBe('Second topic')
            })

            test('read all topics', async () => {
                await createTopic(alice, 'topic1', 'First topic')
                await createTopic(bob, 'topic2', 'Second topic')
                await createTopic(alice, 'topic3', 'Third topic')

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(3)
                expect(rows[0].id).toBe('topic1')
                expect(rows[0].description).toBe('First topic')
                expect(rows[1].id).toBe('topic2')
                expect(rows[1].description).toBe('Second topic')
                expect(rows[2].id).toBe('topic3')
                expect(rows[2].description).toBe('Third topic')
            })

            test('read empty list when no topics exist', async () => {
                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(0)
            })

            test('read all topics after deletion', async () => {
                await createTopic(alice, 'topic1', 'First topic')
                await createTopic(bob, 'topic2', 'Second topic')
                await createTopic(alice, 'topic3', 'Third topic')

                await contracts.sentiment.actions.deletetopic(['topic2']).send(sentimentContract)

                const rows = await contracts.sentiment.tables.topics().getTableRows()
                expect(rows).toHaveLength(2)
                expect(rows[0].id).toBe('topic1')
                expect(rows[1].id).toBe('topic3')
            })
        })
    })

    describe('integration', () => {
        test('full CRUD lifecycle', async () => {
            await createTopic(alice, 'lifecycle', 'Initial description')

            let rows = await contracts.sentiment.tables.topics().getTableRows()
            expect(rows).toHaveLength(1)
            expect(rows[0].id).toBe('lifecycle')
            expect(rows[0].description).toBe('Initial description')

            rows = await contracts.sentiment.tables.topics().getTableRows()
            expect(rows).toHaveLength(1)
            expect(rows[0].id).toBe('lifecycle')

            await contracts.sentiment.actions
                .updatetopic(['lifecycle', 'Updated description'])
                .send(sentimentContract)

            rows = await contracts.sentiment.tables.topics().getTableRows()
            expect(rows[0].description).toBe('Updated description')

            await contracts.sentiment.actions.deletetopic(['lifecycle']).send(sentimentContract)

            rows = await contracts.sentiment.tables.topics().getTableRows()
            expect(rows).toHaveLength(0)
        })
    })
})
