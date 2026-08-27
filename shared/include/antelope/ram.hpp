#pragma once

#include <eosio.system/eosio.system.hpp>

using namespace eosio;

namespace antelope {

int64_t  get_bancor_input(int64_t out_reserve, int64_t inp_reserve, int64_t out);
asset    ram_cost(uint32_t bytes, symbol core_symbol);
asset    ram_cost_with_fee(uint32_t bytes, symbol core_symbol);
uint32_t ram_request_bytes(uint32_t bytes);
asset    ram_charge_for_bytes(uint32_t bytes, symbol core_symbol);
asset    ram_proceeds_minus_fee(uint32_t bytes, symbol core_symbol);
asset    get_fee(const asset quantity);
int64_t  bytes_cost_with_fee(const asset quantity);

} // namespace antelope