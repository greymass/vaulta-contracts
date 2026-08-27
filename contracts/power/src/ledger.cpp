#include <power/power.hpp>

namespace vaultacontracts {

void power::carry_forward(ledger_row& ledger, const uint32_t now, const uint32_t duration)
{
   const uint32_t old_slot = now / ledger.duration;

   int64_t live = 0;
   for (const auto& slot : ledger.slots) {
      if (old_slot - slot.slot < RING_SLOTS) {
         live += slot.bytes;
      }
   }

   // survivors keep the lifetime of the window they were bought under, not the new one
   const uint64_t expires = uint64_t(now) + uint64_t(ledger.duration) * RING_SLOTS_PER_WINDOW;
   ledger.carry_bytes += live;
   if (expires > uint64_t(ledger.carry_expires)) {
      ledger.carry_expires = expires > 0xFFFFFFFFull ? 0xFFFFFFFFu : uint32_t(expires);
   }

   ledger.slots.assign(RING_SLOTS, ram_slot{});
   ledger.duration = duration;
}

int64_t power::record_and_measure(const config_row& cfg, const int64_t bytes)
{
   eosiosystem::powerup_state_singleton _state(SYSTEM_CONTRACT, 0);
   check(_state.exists(), "the powerup market is not initialized on this chain");
   const auto state = _state.get();
   check(state.powerup_days > 0, "the powerup window must be positive");

   const uint32_t duration = uint32_t(uint64_t(state.powerup_days) * 86400 / RING_SLOTS_PER_WINDOW);
   const uint32_t now      = uint32_t(current_time_point().sec_since_epoch());
   const uint32_t now_slot = now / duration;

   ledger_singleton _ledger(get_self(), get_self().value);
   ledger_row       ledger = _ledger.get_or_default();
   if (ledger.slots.size() != RING_SLOTS || ledger.duration == 0) {
      ledger.slots.assign(RING_SLOTS, ram_slot{});
      ledger.duration = duration;
   }
   if (ledger.duration != duration) {
      carry_forward(ledger, now, duration);
   }
   if (now >= ledger.carry_expires) {
      ledger.carry_bytes   = 0;
      ledger.carry_expires = 0;
   }

   ram_slot& current = ledger.slots[now_slot % RING_SLOTS];
   if (current.slot != now_slot) {
      current.slot  = now_slot;
      current.bytes = 0;
   }
   current.bytes += bytes;

   int64_t committed = ledger.carry_bytes;
   for (auto& slot : ledger.slots) {
      if (now_slot - slot.slot >= RING_SLOTS) {
         slot.bytes = 0;
      }
      committed += slot.bytes;
   }
   _ledger.set(ledger, get_self());

   eosiosystem::user_resources_table _userres(SYSTEM_CONTRACT, get_self().value);
   const auto                        res   = _userres.find(get_self().value);
   const int64_t                     quota = res == _userres.end() ? 0 : res->ram_bytes;

   return quota - committed - cfg.cushion_bytes;
}

} // namespace vaultacontracts
