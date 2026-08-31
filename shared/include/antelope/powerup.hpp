#pragma once

#include <eosio.system/eosio.system.hpp>

namespace antelope {

int64_t powerup_fee(const eosiosystem::powerup_state_resource& state, int64_t utilization_increase);

void update_utilization(eosio::time_point_sec now, eosiosystem::powerup_state_resource& res);

void update_weight(eosio::time_point_sec now, eosiosystem::powerup_state_resource& res);

} // namespace antelope
