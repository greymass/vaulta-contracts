#include <mocksystem/mocksystem.hpp>

namespace vaultacontracts {

void mocksystem::newaccount(name creator, name account) { require_auth(creator); }

void mocksystem::giftram(name from, name to, int64_t bytes, string memo)
{
   require_auth(from);
   require_recipient(from);
   check(bytes > 0, "must gift positive bytes");
   check(is_account(to), "to=" + to.to_string() + " account does not exist");

   gifted_ram_table giftedram(get_self(), get_self().value);
   auto             itr = giftedram.find(to.value);
   if (itr == giftedram.end()) {
      giftedram.emplace(from, [&](auto& row) {
         row.giftee    = to;
         row.gifter    = from;
         row.ram_bytes = bytes;
      });
   } else {
      check(itr->gifter == from,
            "A single RAM gifter is allowed at any one time per account, currently holding RAM gifted by: " +
               itr->gifter.to_string());
      giftedram.modify(itr, same_payer, [&](auto& row) { row.ram_bytes += bytes; });
   }
}

void mocksystem::ungiftram(name from, name to, string memo)
{
   require_auth(from);

   gifted_ram_table giftedram(get_self(), get_self().value);
   auto             itr = giftedram.find(from.value);
   check(itr != giftedram.end(), from.to_string() + " does not hold any gifted RAM");
   check(itr->gifter == to, "Returning RAM to wrong gifter, should be: " + itr->gifter.to_string());
   require_recipient(to);

   giftedram.erase(itr);
}

} // namespace vaultacontracts
