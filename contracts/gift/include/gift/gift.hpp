#pragma once

#include <eosio.system/eosio.system.hpp>
#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>

using namespace eosio;
using namespace std;

namespace vaultacontracts {

class [[eosio::contract("gift")]] gift : public contract
{
public:
   using contract::contract;

   static constexpr name     SYSTEM_CONTRACT      = "eosio"_n;
   static constexpr uint32_t QUOTA_WINDOW_SECONDS = 86400;
   static constexpr int64_t  GIFT_ROW_OVERHEAD    = 136;

   struct [[eosio::table("config")]] config_row
   {
      // Whether or not the contract is enabled
      bool enabled = false;
   };

   typedef eosio::singleton<"config"_n, config_row> config_table;

   struct [[eosio::table("creators")]] creator_row
   {
      name           creator;
      int64_t        daily_quota_bytes;
      int64_t        used_bytes;
      time_point_sec window_start;

      uint64_t primary_key() const { return creator.value; }
   };

   typedef eosio::multi_index<"creators"_n, creator_row> creators_table;

   [[eosio::action]] void enable();
   [[eosio::action]] void disable();
   [[eosio::action]] void addcreator(name creator, int64_t daily_quota_bytes);
   [[eosio::action]] void rmcreator(name creator);
   [[eosio::action]] void setquota(name creator, int64_t daily_quota_bytes);
   [[eosio::action]] void giftacct(name creator, name account, int64_t bytes, string memo);

   using enable_action     = eosio::action_wrapper<"enable"_n, &gift::enable>;
   using disable_action    = eosio::action_wrapper<"disable"_n, &gift::disable>;
   using addcreator_action = eosio::action_wrapper<"addcreator"_n, &gift::addcreator>;
   using rmcreator_action  = eosio::action_wrapper<"rmcreator"_n, &gift::rmcreator>;
   using setquota_action   = eosio::action_wrapper<"setquota"_n, &gift::setquota>;
   using giftacct_action   = eosio::action_wrapper<"giftacct"_n, &gift::giftacct>;

#ifdef DEBUG
   [[eosio::action]] void reset();
#endif

private:
   config_row get_config();
   void       set_enabled(bool enabled);
};

} // namespace vaultacontracts
