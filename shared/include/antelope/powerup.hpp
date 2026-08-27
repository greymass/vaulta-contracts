#pragma once

#include <eosio.system/eosio.system.hpp>

namespace antelope {

int64_t powerup_fee(const eosiosystem::powerup_state_resource& state, int64_t utilization_increase);

} // namespace antelope
