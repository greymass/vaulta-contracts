import {Name, PermissionLevel, Serializer, Transaction} from '@wharfkit/antelope'
import {blockchain} from '../helpers'

export const giftContract = 'ram.vaulta'
export const alice = 'alice'
export const bob = 'bob'
export const newuser = 'newuser'
export const newuser2 = 'newuser2'
export const newuser3 = 'newuser3'

export const contracts = {
    gift: blockchain.createContract(giftContract, './contracts/gift/build/gift', true),
    system: blockchain.createContract('eosio', './contracts/mocksystem/build/mocksystem', true),
}

export async function resetContracts() {
    await blockchain.resetTables()
    blockchain.createAccounts(alice, bob, newuser, newuser2, newuser3)
}

export function getCreator(account: string) {
    return contracts.gift.tables
        .creators(Name.from(giftContract).value.value)
        .getTableRow(Name.from(account).value.value)
}

type MockContract = (typeof contracts)[keyof typeof contracts]

export function packAction(contract: MockContract, action: string, data: object, actor: string) {
    return {
        account: contract.name,
        name: Name.from(action),
        data: Serializer.encode({abi: contract.abi, type: action, object: data}).array,
        authorization: [PermissionLevel.from(`${actor}@active`)],
    }
}

export function sendActions(...actions: ReturnType<typeof packAction>[]) {
    return blockchain.applyTransaction(
        Transaction.from({actions, expiration: 0, ref_block_num: 0, ref_block_prefix: 0})
    )
}

export function getConfig() {
    return contracts.gift.tables.config(Name.from(giftContract).value.value).getTableRows()[0]
}

export function giftInTx(
    creator: string,
    account: string,
    bytes: number | string,
    memo = '',
    newaccountCreator = creator
) {
    return sendActions(
        packAction(
            contracts.system,
            'newaccount',
            {creator: newaccountCreator, account},
            newaccountCreator
        ),
        packAction(contracts.gift, 'giftacct', {creator, account, bytes, memo}, creator)
    )
}
