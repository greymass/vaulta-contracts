#include <power/power.hpp>

namespace vaultacontracts {

name power::resolve_receiver(const name from, const string& memo)
{
   if (memo.empty()) {
      return from;
   }
   check(memo.size() <= 13, "the memo must be empty or a single account name");
   const name receiver = name(memo);
   check(receiver.value != 0, "the memo must be empty or a single account name");
   check(is_account(receiver), "the account named in the memo does not exist");
   return receiver;
}

int64_t power::order_cost_bytes(const config_row& cfg, const name receiver)
{
   eosiosystem::user_resources_table _userres(SYSTEM_CONTRACT, receiver.value);
   const bool                        has_row = _userres.find(receiver.value) != _userres.end();
   return cfg.order_bytes + (has_row ? 0 : cfg.userres_bytes);
}

[[eosio::on_notify("*::transfer")]] void power::ontransfer(name from, name to, asset quantity, string memo)
{
   if (from == get_self() || to != get_self()) {
      return;
   }

   const config_row cfg = get_config();
   check(get_first_receiver() == cfg.token_contract,
         "this contract only accepts tokens from the designated token contract");
   check(quantity.symbol == cfg.token_symbol, "this contract only accepts the configured token symbol");

   const name receiver = resolve_receiver(from, memo);

   eosiosystem::powerup_state_singleton _state(SYSTEM_CONTRACT, 0);
   check(_state.exists(), "the powerup market is not initialized on this chain");
   const auto state = _state.get();

   const int64_t bytes      = order_cost_bytes(cfg, receiver);
   const asset   ram_charge = antelope::ram_charge_for_bytes(uint32_t(bytes), cfg.token_symbol);
   check(quantity > ram_charge, "the payment does not cover the RAM cost of the order");

   eosiosystem::system_contract::powerup_action powerup_act{SYSTEM_CONTRACT, {get_self(), "active"_n}};
   powerup_act.send(get_self(), receiver, state.powerup_days, cfg.net_frac, cfg.cpu_frac, quantity - ram_charge);

   settle_action settle_act{get_self(), {get_self(), "active"_n}};
   settle_act.send(from, receiver, quantity, bytes, ram_charge);
}

} // namespace vaultacontracts
