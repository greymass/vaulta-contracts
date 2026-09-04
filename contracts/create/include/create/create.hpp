#pragma once

#include <antelope/publickey.hpp>
#include <antelope/ram.hpp>
#include <eosio.system/eosio.system.hpp>
#include <eosio.token/eosio.token.hpp>
#include <eosio/crypto.hpp>
#include <eosio/eosio.hpp>

using namespace eosio;
using namespace eosiosystem;
using namespace std;

namespace vaultacontracts {

class [[eosio::contract("create")]] create : public contract
{
public:
   using contract::contract;

   static const int64_t BYTES_FOR_ACCOUNT_CREATION = 3000;
   static const int64_t BYTES_FOR_TOKEN_BALANCE    = 260;
   static const int64_t BYTES_FOR_CREATION         = BYTES_FOR_ACCOUNT_CREATION + BYTES_FOR_TOKEN_BALANCE;

   static constexpr name   SYSTEM_CONTRACT        = "eosio"_n;
   static constexpr name   SYSTEM_CONTRACT_PROXY  = "core.vaulta"_n;
   static constexpr symbol PAYMENT_TOKEN          = symbol("A", 4);
   static constexpr name   PAYMENT_TOKEN_CONTRACT = "core.vaulta"_n;
   static constexpr symbol SYSTEM_RAM             = symbol("RAMCORE", 4);

   [[eosio::on_notify("*::transfer")]] void ontransfer(name from, name to, asset quantity, string memo);
   using ontransfer_action = eosio::action_wrapper<"transfer"_n, &create::ontransfer>;

   [[eosio::action, eosio::read_only]] pair<name, eosiosystem::authority> parsememo(string memo);
   using parsememo_action = eosio::action_wrapper<"parsememo"_n, &create::parsememo>;

   [[eosio::action, eosio::read_only]] asset estimatecost();
   using estimatecost_action = eosio::action_wrapper<"estimatecost"_n, &create::estimatecost>;

   struct newaccount
   {
      name                   creator;
      name                   name;
      eosiosystem::authority owner;
      eosiosystem::authority active;
   };

private:
};

} // namespace vaultacontracts