#include <power/power.hpp>

namespace vaultacontracts {

power::rail power::resolve_rail(const config_row& cfg, const name token_contract, const symbol token_symbol)
{
   for (const rail& r : cfg.rails) {
      if (r.token_contract == token_contract && r.token_symbol == token_symbol) {
         return r;
      }
   }
   check(false, "the transfer matches no configured payment rail");
   __builtin_unreachable();
}

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

   // A wrapped powerup's unwrap and rewrap legs arrive from rail contracts mid-order; never orders themselves
   for (const rail& r : cfg.rails) {
      if (from == r.token_contract || from == r.powerup_contract) {
         return;
      }
   }

   const rail r = resolve_rail(cfg, get_first_receiver(), quantity.symbol);

   const name receiver = resolve_receiver(from, memo);

   eosiosystem::powerup_state_singleton _state(SYSTEM_CONTRACT, 0);
   check(_state.exists(), "the powerup market is not initialized on this chain");
   const auto state = _state.get();

   const int64_t bytes      = order_cost_bytes(cfg, receiver);
   const asset   ram_charge = antelope::ram_charge_for_bytes(uint32_t(bytes), r.token_symbol);
   check(quantity > ram_charge, "the payment does not cover the RAM cost of the order");

   eosiosystem::system_contract::powerup_action powerup_act{r.powerup_contract, {get_self(), "active"_n}};
   powerup_act.send(get_self(), receiver, state.powerup_days, cfg.net_frac, cfg.cpu_frac, quantity - ram_charge);

   settle_action settle_act{get_self(), {get_self(), "active"_n}};
   settle_act.send(from, receiver, quantity, bytes, ram_charge, r.token_contract);
}

} // namespace vaultacontracts
