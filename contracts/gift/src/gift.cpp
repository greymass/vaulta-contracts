#include <gift/gift.hpp>

#include <eosio/transaction.hpp>

namespace vaultacontracts {

static bool created_in_transaction(name account)
{
   auto              size = eosio::transaction_size();
   std::vector<char> buffer(size);
   check(eosio::read_transaction(buffer.data(), size) == size, "failed to read transaction");
   auto trx = eosio::unpack<eosio::transaction>(buffer.data(), size);
   for (const auto& act : trx.actions) {
      if (act.account != gift::SYSTEM_CONTRACT || act.name != "newaccount"_n) {
         continue;
      }
      if (act.data.size() < 2 * sizeof(uint64_t)) {
         continue;
      }
      datastream<const char*> ds(act.data.data(), act.data.size());
      name                    creator;
      name                    created;
      ds >> creator >> created;
      if (created == account) {
         return true;
      }
   }
   return false;
}

gift::config_row gift::get_config()
{
   config_table config(get_self(), get_self().value);
   return config.get_or_default();
}

void gift::set_enabled(bool enabled)
{
   require_auth(get_self());
   config_table config(get_self(), get_self().value);
   auto         row = config.get_or_default();
   row.enabled      = enabled;
   config.set(row, get_self());
}

void gift::enable() { set_enabled(true); }

void gift::disable() { set_enabled(false); }

void gift::addcreator(name creator, int64_t daily_quota_bytes)
{
   require_auth(get_self());
   check(is_account(creator), "creator account does not exist");
   check(daily_quota_bytes > GIFT_ROW_OVERHEAD, "quota must exceed the per-gift row overhead");

   creators_table creators(get_self(), get_self().value);
   check(creators.find(creator.value) == creators.end(), "creator already registered");

   creators.emplace(get_self(), [&](auto& row) {
      row.creator           = creator;
      row.daily_quota_bytes = daily_quota_bytes;
      row.used_bytes        = 0;
      row.window_start      = time_point_sec(current_time_point());
   });
}

void gift::rmcreator(name creator)
{
   require_auth(get_self());
   creators_table creators(get_self(), get_self().value);
   auto           itr = creators.require_find(creator.value, "creator not registered");
   creators.erase(itr);
}

void gift::setquota(name creator, int64_t daily_quota_bytes)
{
   require_auth(get_self());
   check(daily_quota_bytes > GIFT_ROW_OVERHEAD, "quota must exceed the per-gift row overhead");
   creators_table creators(get_self(), get_self().value);
   auto           itr = creators.require_find(creator.value, "creator not registered");
   creators.modify(itr, same_payer, [&](auto& row) { row.daily_quota_bytes = daily_quota_bytes; });
}

void gift::giftacct(name creator, name account, int64_t bytes, string memo)
{
   require_auth(creator);
   require_enabled(get_config());
   check(bytes > 0, "must gift positive bytes");
   check(memo.size() <= 256, "memo has more than 256 bytes");
   check(is_account(account), "account does not exist");

   creators_table creators(get_self(), get_self().value);
   auto           itr = creators.require_find(creator.value, "creator not registered");

   auto           now          = time_point_sec(current_time_point());
   int64_t        used         = itr->used_bytes;
   time_point_sec window_start = itr->window_start;
   if (now.sec_since_epoch() - window_start.sec_since_epoch() >= QUOTA_WINDOW_SECONDS) {
      used         = 0;
      window_start = now;
   }
   int64_t remaining = itr->daily_quota_bytes - used;
   check(remaining >= GIFT_ROW_OVERHEAD && bytes <= remaining - GIFT_ROW_OVERHEAD, "daily quota exceeded");

   check(created_in_transaction(account), "account must be created by eosio::newaccount in the same transaction");

   creators.modify(itr, same_payer, [&](auto& row) {
      row.used_bytes   = used + bytes + GIFT_ROW_OVERHEAD;
      row.window_start = window_start;
   });

   eosiosystem::system_contract::giftram_action giftram{SYSTEM_CONTRACT, {{get_self(), "active"_n}}};
   giftram.send(get_self(), account, bytes, memo);
}

} // namespace vaultacontracts

#ifdef DEBUG
#include "debug.cpp"
#endif
