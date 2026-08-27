#include <power/power.hpp>

namespace vaultacontracts {

[[eosio::action, eosio::read_only]] asset power::estimatecost()
{
   const config_row cfg = get_config();

   eosiosystem::powerup_state_singleton _state(SYSTEM_CONTRACT, 0);
   check(_state.exists(), "the powerup market is not initialized on this chain");
   const auto state = _state.get();

   const int64_t cpu_amount = int64_t(int128_t(cfg.cpu_frac) * state.cpu.weight / eosiosystem::powerup_frac);
   const int64_t net_amount = int64_t(int128_t(cfg.net_frac) * state.net.weight / eosiosystem::powerup_frac);

   int64_t fee = antelope::powerup_fee(state.cpu, cpu_amount) + antelope::powerup_fee(state.net, net_amount);
   if (fee < state.min_powerup_fee.amount) {
      fee = state.min_powerup_fee.amount;
   }

   const asset ram_charge =
      antelope::ram_charge_for_bytes(uint32_t(cfg.order_bytes + cfg.userres_bytes), cfg.token_symbol);

   return asset(fee, cfg.token_symbol) + ram_charge;
}

} // namespace vaultacontracts
