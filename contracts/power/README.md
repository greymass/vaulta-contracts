# Powerup Contract

A contract that turns a plain token transfer into CPU and NET for an account. A sender transfers the system token to the contract, and the contract powers up either the sender or an account named in the memo, buys the RAM its own order occupies, and refunds the remainder in the same transaction. It serves accounts whose wallet can only send tokens: exchanges, custodians, hardware flows, and accounts created by `create.gm`, which receive RAM but no CPU or NET. Deployed as `powerup.gm`.

## How it works

1. Call the read-only `estimatecost` action to get the token cost of one powerup at the current market price.
2. Transfer at least that amount of the configured system token to the contract, with an empty memo or a single account name.
3. The contract computes the order's byte cost, buys CPU and NET for the receiver through the system contract, buys the RAM the order occupies, and refunds any excess payment to the sender.

Rules the memo must satisfy:

- Empty powers up the sender.
- A single account name powers up that account. The name must satisfy `is_account`.
- Nothing else is accepted; a memo the contract cannot parse fails the transaction.

Sending more than the `estimatecost` quote is safe: the excess is refunded to the sender. Sending less fails the transaction. The contract holds no balance between transactions, has no owner who can extract value, and has no withdrawal path; every token it receives is spent on the triggering order or refunded within that same transaction.

## Actions

| Action | Auth | Description |
|---|---|---|
| `transfer` notification | token sender | Entry point. Validates token and memo, computes the order, sends `powerup` then `settle` inline. |
| `settle(sender, receiver, payment, bytes, ram_charge)` | contract, inline only | Runs after the powerup has committed. Records the bytes, buys or forwards the RAM charge, refunds the remainder. |
| `estimatecost()` | none (read-only) | Returns the token cost of one powerup at the current market, for wallets to quote before transferring. |
| `configure(token_contract, token_symbol, fee_sink, cpu_frac, net_frac, order_bytes, userres_bytes, cushion_bytes)` | contract | Sets the config singleton. The contract is inert until this runs. |
| `logpowerup(sender, receiver, cost, ram_charge, refund)` | contract | Inline log emitted per powerup for indexers. |

The contract stores two singletons, `config` and `ledger`. `ledger` holds a 25-slot ring tracking the bytes committed by unexpired orders, used to decide whether an order's RAM charge is spent on RAM or forwarded to the fee sink. The ring's bucket duration comes from the chain's `powerup_days`; when that changes, the bytes still live under the old window move into `carry_bytes` and keep counting until `carry_expires`, and the ring restarts on the new duration.

RAM costs are measured constants rather than derived at compile time: a `powup.order` row bills its payer 405 bytes on chain (`order_bytes`), a `userres` row for a receiver with no existing resources bills 272 bytes (`userres_bytes`), and the contract reserves 500,000 bytes (`cushion_bytes`) for its own footprint plus margin. The footprint is dominated by code, which the chain bills at ten times the wasm size, so `cushion_bytes` must stay at or above `10 * wasm + abi + overhead` with margin on every deploy. `bun testnet/check-power-ram.ts` verifies the cushion and the stored ledger's integrity; the `testnet/power` make target runs it before deploying and `testnet/power/verify` runs it after.

## Building

Docker is the only requirement. Builds run inside a container holding Antelope CDT v4.1.1, the version pinned by `CDT_VERSION` in the repository `.env`, installed from the official release package. The container fixes the toolchain completely, which the version alone does not: CDT compiles its wasm C library differently depending on the operating system it was built on, so a locally compiled CDT of the same version produces different bytes.

Run this from the repository root, not from this directory:

```
make build/power/production
```

The output is `contracts/power/build/power.wasm` and `contracts/power/build/power.abi`. The same pattern builds any contract, as `make build/<name>/production`, and `make build/<name>/debug` produces the artifacts the test suite uses. Hosts on arm64, including Apple Silicon, run the image emulated, which is slower and produces identical output.

## Verifying a deployment

Compare the sha256 of a clean local build against the on-chain code hash:

```
shasum -a 256 contracts/power/build/power.wasm
cleos get code powerup.gm
```

## Testing

Unit tests run against the [vert](https://github.com/eosnetworkfoundation/vert) VM, loading the real `eosio.system` wasm rather than a mock, since a mock fee curve would make every economic assertion meaningless the moment it drifted from the real one:

```
make test/power
```
