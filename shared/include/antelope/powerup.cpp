#pragma once

#include "powerup.hpp"

#include <algorithm>
#include <cmath>

namespace antelope {

int64_t powerup_fee(const eosiosystem::powerup_state_resource& state, int64_t utilization_increase)
{
   if (utilization_increase <= 0)
      return 0;

   auto price_integral_delta = [&state](int64_t start_utilization, int64_t end_utilization) -> double {
      double coefficient = (state.max_price.amount - state.min_price.amount) / state.exponent;
      double start_u     = double(start_utilization) / state.weight;
      double end_u       = double(end_utilization) / state.weight;
      return state.min_price.amount * end_u - state.min_price.amount * start_u +
             coefficient * std::pow(end_u, state.exponent) - coefficient * std::pow(start_u, state.exponent);
   };

   auto price_function = [&state](int64_t utilization) -> double {
      double price        = state.min_price.amount;
      double new_exponent = state.exponent - 1.0;
      if (new_exponent <= 0.0) {
         return state.max_price.amount;
      } else {
         price += (state.max_price.amount - state.min_price.amount) *
                  std::pow(double(utilization) / state.weight, new_exponent);
      }
      return price;
   };

   double  fee               = 0.0;
   int64_t start_utilization = state.utilization;
   int64_t end_utilization   = start_utilization + utilization_increase;

   if (start_utilization < state.adjusted_utilization) {
      fee += price_function(state.adjusted_utilization) *
             std::min(utilization_increase, state.adjusted_utilization - start_utilization) / state.weight;
      start_utilization = state.adjusted_utilization;
   }

   if (start_utilization < end_utilization) {
      fee += price_integral_delta(start_utilization, end_utilization);
   }

   return std::ceil(fee);
}

} // namespace antelope
