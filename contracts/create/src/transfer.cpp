namespace vaultacontracts {

[[eosio::action, eosio::read_only]]
pair<name, eosiosystem::authority> create::parsememo(string memo)
{
   size_t separator = memo.find("-");
   check(separator != string::npos, "Invalid memo format");
   auto account_name_str = memo.substr(0, separator);
   // check that the account name is valid
   check(account_name_str.length() > 0, "Invalid account name");
   check(account_name_str.length() <= 12, "Account name is too long");

   auto account        = name(account_name_str);
   auto public_key_str = memo.substr(separator + 1);

   check(!is_account(account), "Account already exists");

   eosio::public_key public_key;
   if (public_key_str.rfind("PUB_", 0) == 0) {
      public_key = antelope::stringToPublicKey(public_key_str);
   } else {
      public_key = antelope::stringToLegacyPublicKey(public_key_str);
   }

   eosiosystem::key_weight k = eosiosystem::key_weight{public_key, 1};
   eosiosystem::authority  auth{.threshold = 1, .keys = {k}, .accounts = {}, .waits = {}};
   return make_pair(account, auth);
}

[[eosio::on_notify("*::transfer")]]
void create::ontransfer(name from, name to, asset quantity, string memo)
{
   // ignore RAM sales
   // ignore the EOS leg core.vaulta sends back to this contract while unwrapping A during buyram
   // ignore transfers not sent to this contract
   if (from == "eosio.ram"_n || from == SYSTEM_CONTRACT_PROXY || to != get_self()) {
      return;
   }

   // ignore transfers sent from this contract to purchase RAM
   // otherwise revert transaction if sending EOS outside of this contract if RAM transfer is enabled
   if (from == get_self()) {
      if (to == "eosio.ram"_n || to == "eosio.ramfee"_n) {
         return;
      }
      return;
   }

   if (memo == "bypass") {
      return;
   }

   check(get_first_receiver() == PAYMENT_TOKEN_CONTRACT,
         "This contract only accepts tokens from the designated token contract. (" +
            PAYMENT_TOKEN_CONTRACT.to_string() + " vs " + get_first_receiver().to_string() + ")");
   check(quantity.symbol == PAYMENT_TOKEN, "Invalid symbol");
   check(quantity.amount > 0, "Invalid amount");

   auto [account, auth] = parsememo(memo);
   const auto  cost     = antelope::ram_cost_with_fee(BYTES_FOR_CREATION, PAYMENT_TOKEN);
   const asset excess   = quantity - cost;

   check(quantity >= cost, "A minimum of " + cost.to_string() + " is required to pay for account creation costs");

   system_contract::newaccount_action newaccount{SYSTEM_CONTRACT, {get_self(), "active"_n}};
   newaccount.send(get_self(), account, auth, auth);

   system_contract::buyram_action buyram{SYSTEM_CONTRACT_PROXY, {get_self(), "active"_n}};
   buyram.send(get_self(), account, cost);

   if (excess.amount > 0) {
      token::transfer_action transfer{PAYMENT_TOKEN_CONTRACT, {get_self(), "active"_n}};
      transfer.send(get_self(), account, excess, string("Excess funds from account creation"));
   }
}

[[eosio::action, eosio::read_only]] asset create::estimatecost()
{
   return antelope::ram_cost_with_fee(BYTES_FOR_CREATION, PAYMENT_TOKEN);
}

} // namespace vaultacontracts