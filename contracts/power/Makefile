#!/bin/bash
include ../../.env
SHELL := /bin/bash
TEST_FILES := $(shell find src -name '*.ts')
BIN := ./node_modules/.bin

INCLUDES = -I include -I ../../shared/include

build/debug: | build/dir
	cdt-cpp -O=2 -abigen -abigen_output=build/${POWER_CONTRACT_NAME}.abi -o build/${POWER_CONTRACT_NAME}.wasm src/${POWER_CONTRACT_NAME}.cpp -R src ${INCLUDES} -D DEBUG

build/production: | build/dir
	cdt-cpp -O=2 -abigen -abigen_output=build/${POWER_CONTRACT_NAME}.abi -o build/${POWER_CONTRACT_NAME}.wasm src/${POWER_CONTRACT_NAME}.cpp -R src ${INCLUDES}

build/dir:
	mkdir -p build

clean:
	rm -rf build

testnet:
	@test -f build/${POWER_CONTRACT_NAME}.wasm -a -f build/${POWER_CONTRACT_NAME}.abi || { \
		echo "No build artifacts in $(CURDIR)/build."; \
		echo "Run 'make build/power/debug' from the repository root first."; \
		exit 1; \
	}
	cleos -u $(TESTNET_NODE_URL) set contract $(POWER_TESTNET_ACCOUNT) \
		build/ ${POWER_CONTRACT_NAME}.wasm ${POWER_CONTRACT_NAME}.abi

mainnet:
	@test -f build/${POWER_CONTRACT_NAME}.wasm -a -f build/${POWER_CONTRACT_NAME}.abi || { \
		echo "No build artifacts in $(CURDIR)/build."; \
		echo "Run 'make build/power/production' from the repository root first."; \
		exit 1; \
	}
	@test -n "$(POWER_MAINNET_ACCOUNT)" || { echo "POWER_MAINNET_ACCOUNT is not set in .env"; exit 1; }
	@echo "Deploying ${POWER_CONTRACT_NAME} to $(POWER_MAINNET_ACCOUNT) on $(MAINNET_NODE_URL)"
	cleos -u $(MAINNET_NODE_URL) set contract $(POWER_MAINNET_ACCOUNT) \
		build/ ${POWER_CONTRACT_NAME}.wasm ${POWER_CONTRACT_NAME}.abi
