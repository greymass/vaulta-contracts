include .env

BIN := ./node_modules/.bin
SHELL := /bin/bash

CDT_IMAGE := vaulta-contracts-cdt:$(CDT_VERSION)

DOCKER_RUN = docker run --rm --platform=linux/amd64 \
	-u $$(id -u):$$(id -g) \
	-e HOME=/tmp \
	-v "$(CURDIR)":/repo \
	-w /repo \
	$(CDT_IMAGE)

# DOCKER BUILDS

DOCKER_BUILD_FLAGS ?=

.PHONY: docker/image
docker/image:
	docker build --platform=linux/amd64 $(DOCKER_BUILD_FLAGS) \
		--build-arg CDT_VERSION=$(CDT_VERSION) \
		-t $(CDT_IMAGE) docker

# CONTRACT BUILD
#
# Every build runs inside the toolchain container. The native/... targets hold the
# recipes that run inside it and are not meant to be invoked on a host.

.PHONY: build build/debug build/production
build: build/production

build/debug: docker/image
	$(DOCKER_RUN) make native/build/debug

build/production: docker/image
	$(DOCKER_RUN) make native/build/production

build/%/debug: docker/image
	$(DOCKER_RUN) make native/build/$*/debug

build/%/production: docker/image
	$(DOCKER_RUN) make native/build/$*/production

.PHONY: native/build/debug native/build/production
native/build/debug: native/build/api/debug native/build/create/debug native/build/gift/debug native/build/mocksystem/debug native/build/mockreceiver/debug native/build/power/debug native/build/registry/debug native/build/sentiment/debug native/build/tokens/debug

native/build/production: native/build/api/production native/build/create/production native/build/gift/production native/build/power/production native/build/registry/production native/build/sentiment/production native/build/tokens/production

native/build/%/debug:
	make -C contracts/$* build/debug

native/build/%/production:
	make -C contracts/$* build/production

.PHONY: clean
clean:
	rm ./codegen/*.ts

# MAINNET
.PHONY: mainnet/create
mainnet/create: build/create/production
	make -C contracts/create mainnet

.PHONY: mainnet/power
mainnet/power: build/power/production node_modules
	NETWORK=mainnet bun testnet/check-power-ram.ts
	make -C contracts/power mainnet

.PHONY: mainnet/power/verify
mainnet/power/verify: node_modules
	NETWORK=mainnet bun testnet/verify-power.ts
	NETWORK=mainnet bun testnet/check-power-ram.ts

.PHONY: mainnet/sentiment
mainnet/sentiment: build/sentiment/debug
	make -C contracts/sentiment mainnet

# TESTNET

.PHONY: testnet
testnet: testnet/api testnet/mockreceiver testnet/registry testnet/sentiment testnet/tokens

.PHONY: testnet/api
testnet/api: build/api/debug
	make -C contracts/api testnet

.PHONY: testnet/create
testnet/create: build/create/debug
	make -C contracts/create testnet

.PHONY: testnet/create/verify
testnet/create/verify: node_modules
	bun testnet/verify-create.ts

.PHONY: testnet/gift
testnet/gift: build/gift/debug
	make -C contracts/gift testnet

.PHONY: testnet/power
testnet/power: build/power/debug node_modules
	bun testnet/check-power-ram.ts
	make -C contracts/power testnet

.PHONY: testnet/power/verify
testnet/power/verify: node_modules
	bun testnet/verify-power.ts
	bun testnet/check-power-ram.ts

.PHONY: testnet/mockreceiver
testnet/mockreceiver: build/mockreceiver/debug
	make -C contracts/mockreceiver testnet

.PHONY: testnet/registry
testnet/registry: build/registry/debug
	make -C contracts/registry testnet

.PHONY: testnet/sentiment
testnet/sentiment: build/sentiment/debug
	make -C contracts/sentiment testnet

.PHONY: testnet/tokens
testnet/tokens: build/tokens/debug
	make -C contracts/tokens testnet

.PHONY: testnet/gift/demo
testnet/gift/demo: codegen
	bun run testnet/gift-demo.ts

.PHONY: testnet/setup
testnet/setup: codegen
	bun run testnet/setup.ts

.PHONY: testnet/wipe
testnet/wipe: codegen
	bun run testnet/wipe.ts

.PHONY: testnet/reset
testnet/reset: codegen testnet/wipe testnet/setup

# UNIT TESTS

test/api: build/api/debug node_modules codegen
	bun test -t "contract: api"

test/create: build/create/debug node_modules codegen
	bun test -t "contract: create"

test/gift: build/gift/debug node_modules codegen
	bun test -t "contract: gift"

test/mockreceiver: build/mockreceiver/debug node_modules codegen
	bun test -t "contract: mockreceiver"

test/power: build/power/debug node_modules codegen
	bun test -t "contract: power"

test/registry: build/registry/debug node_modules codegen
	bun test -t "contract: registry"

test/sentiment: build/sentiment/debug node_modules codegen
	bun test -t "contract: sentiment"

test/tokens: build/tokens/debug node_modules codegen
	bun test -t "contract: tokens"

node_modules:
	bun install --frozen-lockfile

.PHONY: check
check: cppcheck jscheck

.PHONY: cppcheck
cppcheck:
	clang-format --dry-run --Werror contracts/**/src/*.cpp contracts/**/include/**/*.hpp shared/include/antelope/*.hpp

.PHONY: format
format:
	clang-format -i contracts/**/src/*.cpp contracts/**/include/**/*.hpp shared/include/antelope/*.hpp

.PHONY: jscheck
jscheck: node_modules
	@${BIN}/eslint test --ext .ts --max-warnings 0 --format unix && echo "Ok"

test: build/debug codegen node_modules 
	bun test

# CODEGEN

.PHONY: codegen
codegen: ./codegen/api.ts ./codegen/gift.ts ./codegen/mockreceiver.ts ./codegen/power.ts ./codegen/registry.ts ./codegen/sentiment.ts ./codegen/token.ts ./codegen/tokens.ts

.PHONY: codegen/clean
codegen/clean:
	rm -rf ./codegen/*.ts

./codegen/api.ts: ./contracts/api/build/api.abi
	${BIN}/wharfkit generate --json ./contracts/api/build/api.abi --file ./codegen/api.ts api

./codegen/gift.ts: ./contracts/gift/build/gift.abi
	${BIN}/wharfkit generate --json ./contracts/gift/build/gift.abi --file ./codegen/gift.ts gift

./codegen/mockreceiver.ts: ./contracts/mockreceiver/build/mockreceiver.abi
	${BIN}/wharfkit generate --json ./contracts/mockreceiver/build/mockreceiver.abi --file ./codegen/mockreceiver.ts mockreceiver

./codegen/power.ts: ./contracts/power/build/power.abi
	${BIN}/wharfkit generate --json ./contracts/power/build/power.abi --file ./codegen/power.ts power

./codegen/registry.ts: ./contracts/registry/build/registry.abi
	${BIN}/wharfkit generate --json ./contracts/registry/build/registry.abi --file ./codegen/registry.ts registry

./codegen/sentiment.ts: ./contracts/sentiment/build/sentiment.abi
	${BIN}/wharfkit generate --json ./contracts/sentiment/build/sentiment.abi --file ./codegen/sentiment.ts sentiment

./codegen/token.ts: ./shared/include/eosio.token/eosio.token.abi
	${BIN}/wharfkit generate --json ./shared/include/eosio.token/eosio.token.abi --file ./codegen/token.ts token

./codegen/tokens.ts: ./contracts/tokens/build/tokens.abi
	${BIN}/wharfkit generate --json ./contracts/tokens/build/tokens.abi --file ./codegen/tokens.ts tokens

./contracts/%.abi: docker/image
	$(DOCKER_RUN) make native/build/$(firstword $(subst /, ,$*))/debug
