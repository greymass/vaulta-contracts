#include <power/power.hpp>

#include "estimate.cpp"
#include "ledger.cpp"
#include "settle.cpp"
#include "transfer.cpp"
#include <antelope/powerup.cpp>
#include <antelope/ram.cpp>

namespace vaultacontracts {

power::config_row power::get_config()
{
   config_singleton _config(get_self(), get_self().value);
   check(_config.exists(), "the contract is not configured");
   return _config.get();
}

[[eosio::action]] void power::configure(const vector<rail> rails,
                                        const int64_t      cpu_frac,
                                        const int64_t      net_frac,
                                        const int64_t      order_bytes,
                                        const int64_t      userres_bytes,
                                        const int64_t      cushion_bytes)
{
   require_auth(get_self());
   check(rails.size() >= 1, "at least one payment rail is required");
   check(rails.size() <= MAX_RAILS, "at most four payment rails are allowed");
   for (size_t i = 0; i < rails.size(); i++) {
      const rail& r = rails[i];
      check(is_account(r.token_contract), "each rail's token contract must be an existing account");
      check(is_account(r.powerup_contract), "each rail's powerup contract must be an existing account");
      check(r.token_symbol.is_valid(), "each rail's token symbol must be valid");
      check(r.token_symbol.precision() == rails[0].token_symbol.precision(),
            "all rail symbols must share one precision");
      for (size_t j = 0; j < i; j++) {
         check(rails[j].token_contract != r.token_contract || rails[j].token_symbol != r.token_symbol,
               "each rail's token contract and symbol must be unique");
      }
   }
   check(cpu_frac >= 0 && cpu_frac <= eosiosystem::powerup_frac, "cpu_frac must be within the market range");
   check(net_frac >= 0 && net_frac <= eosiosystem::powerup_frac, "net_frac must be within the market range");
   check(cpu_frac > 0 || net_frac > 0, "the allotment must request some resource");
   check(order_bytes > 0, "order_bytes must be positive");
   check(order_bytes <= 1000000, "order_bytes must not exceed one million");
   check(userres_bytes >= 0, "userres_bytes must not be negative");
   check(userres_bytes <= 1000000, "userres_bytes must not exceed one million");
   check(cushion_bytes >= 0, "cushion_bytes must not be negative");

   config_singleton _config(get_self(), get_self().value);
   _config.set(config_row{rails, cpu_frac, net_frac, order_bytes, userres_bytes, cushion_bytes}, get_self());
}

} // namespace vaultacontracts
