#pragma once

#include "ram.hpp"

namespace antelope {

using eosio::asset;

int64_t get_bancor_input(int64_t out_reserve, int64_t inp_reserve, int64_t out)
{
   const double ob = out_reserve;
   const double ib = inp_reserve;

   int64_t inp = (ib * out) / (ob - out);

   if (inp < 0)
      inp = 0;

   return inp;
}

int64_t get_bancor_output(int64_t inp_reserve, int64_t out_reserve, int64_t inp)
{
   const double ib = inp_reserve;
   const double ob = out_reserve;
   const double in = inp;

   int64_t out = int64_t((in * ob) / (ib + in));

   if (out < 0)
      out = 0;

   return out;
}

double round_to(double value, double precision = 1.0, bool up = false)
{
   if (up) {
      return std::ceil(value / precision) * precision;
   } else {
      return std::floor(value / precision) * precision;
   }
}

asset get_fee(const asset quantity)
{
   asset fee  = quantity;
   fee.amount = (fee.amount + 199) / 200; /// .5% fee (round up)
   return fee;
}

int64_t bytes_cost_with_fee(const asset quantity)
{
   name      system_account = "eosio"_n;
   rammarket _rammarket(system_account, system_account.value);

   const asset fee                = get_fee(quantity);
   const asset quantity_after_fee = quantity - fee;

   auto          itr         = _rammarket.find(system_contract::ramcore_symbol.raw());
   const int64_t ram_reserve = itr->base.balance.amount;
   const int64_t eos_reserve = itr->quote.balance.amount;
   const int64_t cost        = get_bancor_output(eos_reserve, ram_reserve, quantity_after_fee.amount);
   return cost;
}

asset ram_cost(uint32_t bytes, symbol core_symbol)
{
   name          system_account = "eosio"_n;
   rammarket     _rammarket(system_account, system_account.value);
   auto          itr         = _rammarket.find(system_contract::ramcore_symbol.raw());
   const int64_t ram_reserve = itr->base.balance.amount;
   const int64_t eos_reserve = itr->quote.balance.amount;
   const int64_t cost        = get_bancor_input(ram_reserve, eos_reserve, bytes);
   return asset{cost, core_symbol};
}

asset ram_cost_with_fee(uint32_t bytes, symbol core_symbol)
{
   const asset cost = ram_cost(bytes, core_symbol);
   const asset fee  = get_fee(cost);
   return cost + fee;
}

// buyrambytes truncates its bancor input, fee gross-up and output, and buyram rounds its fee up; three units of margin provably cover all four (proof in the 2026-08-31 ledger entry)
uint32_t ram_request_bytes(uint32_t bytes)
{
   name          system_account = "eosio"_n;
   rammarket     _rammarket(system_account, system_account.value);
   auto          itr         = _rammarket.find(system_contract::ramcore_symbol.raw());
   const int64_t ram_reserve = itr->base.balance.amount;
   const int64_t eos_reserve = itr->quote.balance.amount;

   const int64_t margin = 1 + int64_t(3.0 * (ram_reserve - bytes) / eos_reserve);
   return bytes + uint32_t(margin);
}

// Mirrors what buyrambytes spends for the requested bytes, so the charge and the purchase agree exactly
asset ram_charge_for_bytes(uint32_t bytes, symbol core_symbol)
{
   const int64_t cost = ram_cost(ram_request_bytes(bytes), core_symbol).amount;
   return asset{int64_t(cost / double(0.995)), core_symbol};
}

asset ram_proceeds(uint32_t bytes, symbol core_symbol)
{
   name          system_account = "eosio"_n;
   rammarket     _rammarket(system_account, system_account.value);
   auto          itr         = _rammarket.find(system_contract::ramcore_symbol.raw());
   const int64_t ram_reserve = itr->base.balance.amount;
   const int64_t eos_reserve = itr->quote.balance.amount;
   const int64_t cost        = get_bancor_output(ram_reserve, eos_reserve, bytes);
   return asset{cost, core_symbol};
}

asset ram_proceeds_minus_fee(uint32_t bytes, symbol core_symbol)
{
   const asset cost = ram_proceeds(bytes, core_symbol);
   const asset fee  = get_fee(cost);
   return cost - fee;
}

} // namespace antelope