#include <power/power.hpp>

namespace vaultacontracts {

[[eosio::action, eosio::read_only]] asset power::estimatecost()
{
   const config_row cfg          = get_config();
   const symbol     quote_symbol = cfg.rails[0].token_symbol;

   eosiosystem::powerup_state_singleton _state(SYSTEM_CONTRACT, 0);
   check(_state.exists(), "the powerup market is not initialized on this chain");
   auto state = _state.get();

   const eosio::time_point_sec now = eosio::current_time_point();
   antelope::update_utilization(now, state.cpu);
   antelope::update_weight(now, state.cpu);
   antelope::update_utilization(now, state.net);
   antelope::update_weight(now, state.net);

   const int64_t cpu_amount = int64_t(int128_t(cfg.cpu_frac) * state.cpu.weight / eosiosystem::powerup_frac);
   const int64_t net_amount = int64_t(int128_t(cfg.net_frac) * state.net.weight / eosiosystem::powerup_frac);

   const int64_t fee = antelope::powerup_fee(state.cpu, cpu_amount) + antelope::powerup_fee(state.net, net_amount);
   check(fee >= state.min_powerup_fee.amount, "the configured resources price below the chain's minimum powerup fee");

   const asset ram_charge = antelope::ram_charge_for_bytes(uint32_t(cfg.order_bytes + cfg.userres_bytes), quote_symbol);

   return asset(fee, quote_symbol) + ram_charge;
}

} // namespace vaultacontracts
