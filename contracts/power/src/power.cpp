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

[[eosio::action]] void power::configure(const name    token_contract,
                                        const symbol  token_symbol,
                                        const int64_t cpu_frac,
                                        const int64_t net_frac,
                                        const int64_t order_bytes,
                                        const int64_t userres_bytes,
                                        const int64_t cushion_bytes)
{
   require_auth(get_self());
   check(is_account(token_contract), "the token contract must be an existing account");
   check(cpu_frac >= 0 && cpu_frac <= eosiosystem::powerup_frac, "cpu_frac must be within the market range");
   check(net_frac >= 0 && net_frac <= eosiosystem::powerup_frac, "net_frac must be within the market range");
   check(cpu_frac > 0 || net_frac > 0, "the allotment must request some resource");
   check(order_bytes > 0, "order_bytes must be positive");
   check(order_bytes <= 1000000, "order_bytes must not exceed one million");
   check(userres_bytes >= 0, "userres_bytes must not be negative");
   check(userres_bytes <= 1000000, "userres_bytes must not exceed one million");
   check(cushion_bytes >= 0, "cushion_bytes must not be negative");

   config_singleton _config(get_self(), get_self().value);
   _config.set(config_row{token_contract, token_symbol, cpu_frac, net_frac, order_bytes, userres_bytes, cushion_bytes},
               get_self());
}

} // namespace vaultacontracts
