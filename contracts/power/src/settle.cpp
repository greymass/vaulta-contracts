#include <power/power.hpp>

namespace vaultacontracts {

asset power::contract_balance(const rail& r)
{
   eosio::token::accounts _accounts(r.token_contract, get_self().value);
   const auto             itr = _accounts.find(r.token_symbol.code().raw());
   return itr == _accounts.end() ? asset(0, r.token_symbol) : itr->balance;
}

[[eosio::action]] void power::settle(const name    sender,
                                     const name    receiver,
                                     const asset   payment,
                                     const int64_t bytes,
                                     const asset   ram_charge,
                                     const name    token_contract)
{
   require_auth(get_self());
   check(get_sender() == get_self(), "settle runs only as an inline action of this contract");

   const config_row cfg  = get_config();
   const rail       r    = resolve_rail(cfg, token_contract, payment.symbol);
   const int64_t    free = record_and_measure(cfg, bytes);

   if (free < 0) {
      eosiosystem::system_contract::buyrambytes_action buyram_act{r.powerup_contract, {get_self(), "active"_n}};
      buyram_act.send(get_self(), get_self(), antelope::ram_request_bytes(uint32_t(bytes)));
   }
   const asset ram_spent = free < 0 ? ram_charge : asset(0, r.token_symbol);

   const asset balance = contract_balance(r);
   const asset refund  = balance - ram_spent;
   check(refund.amount >= 0, "the order consumed more than the payment allowed");

   if (refund.amount > 0) {
      eosio::token::transfer_action refund_act{r.token_contract, {get_self(), "active"_n}};
      refund_act.send(get_self(), sender, refund, "powerup refund");
   }

   logpowerup_action log_act{get_self(), {get_self(), "active"_n}};
   log_act.send(sender, receiver, payment - balance, ram_spent, refund);
}

[[eosio::action]] void
power::logpowerup(const name sender, const name receiver, const asset cost, const asset ram_spent, const asset refund)
{
   require_auth(get_self());
   check(get_sender() == get_self(), "logpowerup runs only as an inline action of this contract");
   require_recipient(sender);
}

} // namespace vaultacontracts
