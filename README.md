# Vaulta Contracts

Smart contracts for the Vaulta network. Contracts proposed for network adoption link to their Vaulta Proposal (VP) in the [vaulta-proposals](https://github.com/greymass/vaulta-proposals) repository, where each proposal documents the intended deployment and the msig that enacts it.

## Contracts

| Contract | Purpose | Proposal |
| --- | --- | --- |
| [`api`](contracts/api) | Read-only API actions to retrieve account, token, and network information. | |
| [`create`](contracts/create) | Self-serve account creation: send the network token with a memo describing the new account, and the contract creates it, buys its RAM, and refunds any overpayment. | [VP-0002](https://github.com/greymass/vaulta-proposals/blob/master/proposals/vp-0002-account-creation/proposal.md) |
| [`gift`](contracts/gift) | Free account creation through the `giftram` mechanism: admitted creators cover a new account's RAM from a network endowment within daily quotas, gifting only to accounts created in the same transaction, and the RAM returns to the endowment if the account releases it. | [VP-0001](https://github.com/greymass/vaulta-proposals/blob/master/proposals/vp-0001-ram-gifting/proposal.md) |
| [`registry`](contracts/registry) | A paid registry of unique token tickers: creators pay a fee to claim a ticker and precision, then bind it to a whitelisted token contract. | |
| [`sentiment`](contracts/sentiment) | On-chain sentiment signaling with stake-weighted metrics. | |
| [`tokens`](contracts/tokens) | A token contract following the eosio.token standard that allows multiple tokens. | |

## Development support

Three additional directories support development and testing rather than deployment. [`ctemplate`](contracts/ctemplate) is the template used to scaffold new contracts in this repository. [`mocksystem`](contracts/mocksystem) is a test-only mock of `eosio.system`'s `giftram` semantics, deployed as `eosio` in vert unit tests. [`mockreceiver`](contracts/mockreceiver) is a test-only example of a contract that receives token transfers and forwards them without consuming its own RAM.

## Building

Docker is the only requirement. Every build runs inside a container holding the Antelope CDT release pinned by `CDT_VERSION` in `.env`, installed from the official release package on a base image pinned by digest.

```
make build/<name>/production
```

Artifacts land in `contracts/<name>/build/`. `make build/<name>/debug` produces what the test suite uses, and `make build/production` or `make build/debug` builds every contract in one container. Hosts on arm64, including Apple Silicon, run the image emulated, which is slower and produces identical output.

The container is what makes the output reproducible, and the pinned version alone is not enough: CDT compiles its wasm C library differently depending on the operating system it was built on, so a CDT of the same version compiled locally on macOS produces different bytes than the published Linux package. Comparing a build against a deployed contract is covered in `contracts/create/README.md`.

## Deploying

`make testnet/<name>` and `make mainnet/create` build through the container and then deploy with `cleos`, which runs on the host and needs an unlocked wallet. Account names and node URLs come from `.env`.