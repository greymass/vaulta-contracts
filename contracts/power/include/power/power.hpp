#pragma once

#include <antelope/powerup.hpp>
#include <antelope/ram.hpp>
#include <eosio.system/eosio.system.hpp>
#include <eosio.token/eosio.token.hpp>
#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>

using namespace eosio;
using namespace eosiosystem;
using namespace std;

namespace vaultacontracts {

class [[eosio::contract("power")]] power : public contract
{
public:
   using contract::contract;

   static constexpr name     SYSTEM_CONTRACT       = "eosio"_n;
   static constexpr uint32_t RING_SLOTS            = 25;
   static constexpr uint32_t RING_SLOTS_PER_WINDOW = 24;
   static constexpr size_t   MAX_RAILS             = 4;

   struct ram_slot
   {
      uint32_t slot  = 0;
      int64_t  bytes = 0;
   };

   struct rail
   {
      name   token_contract;
      symbol token_symbol;
      name   powerup_contract;
   };

   struct [[eosio::table("config"), eosio::contract("power")]] config_row
   {
      vector<rail> rails;
      int64_t      cpu_frac      = 0;
      int64_t      net_frac      = 0;
      int64_t      order_bytes   = 0;
      int64_t      userres_bytes = 0;
      int64_t      cushion_bytes = 0;
   };
   typedef eosio::singleton<"config"_n, config_row> config_singleton;

   struct [[eosio::table("ledger"), eosio::contract("power")]] ledger_row
   {
      uint32_t         duration      = 0;
      int64_t          carry_bytes   = 0;
      uint32_t         carry_expires = 0;
      vector<ram_slot> slots;
   };
   typedef eosio::singleton<"ledger"_n, ledger_row> ledger_singleton;

   [[eosio::action]] void configure(const vector<rail> rails,
                                    const int64_t      cpu_frac,
                                    const int64_t      net_frac,
                                    const int64_t      order_bytes,
                                    const int64_t      userres_bytes,
                                    const int64_t      cushion_bytes);

   [[eosio::on_notify("*::transfer")]] void ontransfer(name from, name to, asset quantity, string memo);

   [[eosio::action]] void settle(const name    sender,
                                 const name    receiver,
                                 const asset   payment,
                                 const int64_t bytes,
                                 const asset   ram_charge,
                                 const name    token_contract);
   using settle_action = eosio::action_wrapper<"settle"_n, &power::settle>;

   [[eosio::action, eosio::read_only]] asset estimatecost();
   using estimatecost_action = eosio::action_wrapper<"estimatecost"_n, &power::estimatecost>;

   [[eosio::action]] void
   logpowerup(const name sender, const name receiver, const asset cost, const asset ram_spent, const asset refund);
   using logpowerup_action = eosio::action_wrapper<"logpowerup"_n, &power::logpowerup>;

private:
   config_row get_config();
   rail       resolve_rail(const config_row& cfg, const name token_contract, const symbol token_symbol);
   name       resolve_receiver(const name from, const string& memo);
   int64_t    record_and_measure(const config_row& cfg, const int64_t bytes);
   void       carry_forward(ledger_row& ledger, const uint32_t now, const uint32_t duration);
   int64_t    order_cost_bytes(const config_row& cfg, const name receiver);
   asset      contract_balance(const rail& r);
};

} // namespace vaultacontracts
