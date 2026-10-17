# RAM Gift Contract

A creator registered with this contract gifts RAM from a network endowment to each account it creates, so onboarding a user costs the creator no RAM of its own. The contract is proposed as `ram.vaulta`, a network-owned account holding a RAM endowment, in [VP-0001](https://github.com/greymass/vaulta-proposals). Gifts go through the system `giftram` action, so recipients can use the RAM but cannot sell or transfer it, and its only exit is a full return to `ram.vaulta` through `ungiftram`.

## How it works

1. Producers admit a creator with a 15/21 msig carrying `addcreator(creator, daily_quota_bytes)`.
2. The creator builds one transaction that creates an account with `eosio::newaccount` and then calls `giftacct` for that account.
3. `giftacct` confirms the creator is registered and the contract is enabled, finds the matching `newaccount` in the transaction, debits the creator's daily quota, and sends an inline `eosio::giftram` from `ram.vaulta` to the new account.

Rules a creator's transaction must satisfy:

- Both `newaccount` and `giftacct` are top-level actions, and `newaccount` comes first. The contract finds `newaccount` by reading the packed transaction, which holds only top-level actions, so accounts created inline by another contract or inside an `eosio.msig` `exec` cannot receive a gift.
- The account signing `newaccount` need not be the creator. Creating `bob.foo` needs `foo`'s authority, so a creator registered as `gm` can fund an account that `foo` creates, and the gift is charged to `gm`'s quota.
- A single-key account uses 2,996 bytes and the system adds 1,400 free bytes once the account holds any RAM, so the smallest gift that completes `newaccount` is 1,596 bytes. Each extra key or permission level raises that figure.
- An account holds RAM from one gifter at a time. An account funded by this contract can receive another party's `giftram` only after it returns the gift with `ungiftram`.

Each `giftacct` call debits the quota by the gifted bytes plus 136 bytes, the size of the `giftedram` row `ram.vaulta` pays for each giftee. The quota is a byte count over a 24-hour window that opens on the creator's first gift and resets on the first gift at least 24 hours later. A creator can read its remaining quota from the `creators` table.

## Example transaction

Creating `alice.gm` with a 3,000-byte gift, signed by `gm` as both account creator and registered creator:

```json
{
  "actions": [
    {
      "account": "eosio",
      "name": "newaccount",
      "authorization": [{"actor": "gm", "permission": "active"}],
      "data": {
        "creator": "gm",
        "name": "alice.gm",
        "owner": {"threshold": 1, "keys": [{"key": "PUB_K1_...", "weight": 1}], "accounts": [], "waits": []},
        "active": {"threshold": 1, "keys": [{"key": "PUB_K1_...", "weight": 1}], "accounts": [], "waits": []}
      }
    },
    {
      "account": "ram.vaulta",
      "name": "giftacct",
      "authorization": [{"actor": "gm", "permission": "active"}],
      "data": {"creator": "gm", "account": "alice.gm", "bytes": 3000, "memo": "welcome"}
    }
  ]
}
```

This gift debits 3,136 bytes from `gm`'s daily quota.

## Actions

| Action | Auth | Description |
|---|---|---|
| `giftacct(creator, account, bytes, memo)` | `creator` | Gifts `bytes` of RAM to `account`, which a top-level `newaccount` in the same transaction must create. Memo up to 256 bytes. |
| `addcreator(creator, daily_quota_bytes)` | `ram.vaulta` | Registers a creator. The quota must exceed 136 bytes. |
| `rmcreator(creator)` | `ram.vaulta` | Removes a creator. |
| `setquota(creator, daily_quota_bytes)` | `ram.vaulta` | Changes a creator's quota without resetting its usage. |
| `enable()` | `ram.vaulta` | Allows registered creators to gift. |
| `disable()` | `ram.vaulta` | Stops all gifting and leaves the registry in place. VP-0001 links this action alone to a smaller break-glass permission. |

Tables, both scoped to the contract account:

- `config`: a singleton with `enabled`, which is `false` until `enable` runs.
- `creators`: one row per creator with `creator`, `daily_quota_bytes`, `used_bytes` and `window_start`.

The contract declares no notification handlers. The system contract notifies `ram.vaulta` on every `giftram` and `ungiftram`, and with no handler those notifications have no effect, so a giftee's return always reaches the system contract's own checks.

## Building

Docker is the only requirement. Builds run inside a container holding Antelope CDT v4.1.1, the version pinned by `CDT_VERSION` in the repository `.env`. Run this from the repository root:

```
make build/gift/production
```

The output is `contracts/gift/build/gift.wasm` and `contracts/gift/build/gift.abi`. The debug and production targets compile the same source, so the test suite exercises the bytes that ship.

## Verifying a deployment

Compare the sha256 of a clean local build against the on-chain code hash:

```
shasum -a 256 contracts/gift/build/gift.wasm
cleos -u https://vaulta.greymass.com get code ram.vaulta
```

## Testing

Unit tests run against the [vert](https://www.npmjs.com/package/@greymass/vert) VM, with `contracts/mocksystem` standing in for the `giftram`, `ungiftram` and `newaccount` system actions and their notifications:

```
make -C ../.. test/gift
```

`make -C ../.. testnet/gift/demo` creates a throwaway account on Jungle 4 through `GIFT_TESTNET_ACCOUNT`, using `TESTNET_TEST_ACCOUNT` as the creator and its key in the gitignored `.env.local`.

## Deploying

```
make -C ../.. testnet/gift
```

The testnet target builds and deploys to `GIFT_TESTNET_ACCOUNT` on Jungle 4. On mainnet, the VP-0001 enactment msigs create `ram.vaulta`, deploy this contract to it, and seed it from `admin.grants`.
