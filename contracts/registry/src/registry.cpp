#include <registry/registry.hpp>

namespace vaultacontracts {

registry::config_row registry::get_config()
{
   config_table _config(get_self(), get_self().value);
   return _config.get_or_default();
}

bool registry::is_enabled() { return get_config().enabled; }

void registry::open_balance(const name& account)
{
   balance_table balances(get_self(), get_self().value);
   auto          balance_itr = balances.find(account.value);
   check(balance_itr == balances.end(), "balance already exists for account");
   balances.emplace(account, [&](auto& b) {
      b.account = account;
      b.balance = asset(0, get_config().fees.token.symbol);
   });
}

void registry::close_balance(const name& account)
{
   balance_table balances(get_self(), get_self().value);
   auto          balance_itr = balances.find(account.value);
   check(balance_itr != balances.end(), "no balance for account to close");
   check(balance_itr->balance.amount == 0, "cannot close balance with non-zero amount");
   balances.erase(balance_itr);
}

void registry::add_balance(const name& account, const asset& quantity)
{
   balance_table balances(get_self(), get_self().value);
   auto          balance_itr = balances.find(account.value);
   check(balance_itr != balances.end(), "no balance for account, call openbalance first");
   balances.modify(balance_itr, same_payer, [&](auto& b) { b.balance += quantity; });
}

void registry::add_token(const symbol_code& ticker, const uint8_t& precision, const name& creator, const name& rampayer)
{
   // Constrain precision between 0 and 18
   check(precision >= 0, "Precision must be greater than 0");
   check(precision <= 18, "Precision must be less than or equal to 18");

   token_table tokens(get_self(), get_self().value);
   tokens.emplace(rampayer, [&](auto& row) {
      row.ticker    = ticker;
      row.precision = precision;
      row.creator   = creator;
   });
}

asset registry::get_balance(const name& account, const symbol& token_symbol)
{
   balance_table balances(get_self(), get_self().value);
   auto          balance_itr = balances.find(account.value);
   if (balance_itr != balances.end()) {
      return balance_itr->balance;
   } else {
      return asset(0, token_symbol);
   }
}

void registry::remove_balance(const name& account, const asset& quantity)
{
   balance_table balances(get_self(), get_self().value);
   auto          balance_itr = balances.find(account.value);
   check(balance_itr != balances.end(), "no contract balance for account");
   check(balance_itr->balance.amount >= quantity.amount, "insufficient contract balance");

   if (balance_itr->balance.amount == quantity.amount) {
      balances.erase(balance_itr);
   } else {
      balances.modify(balance_itr, same_payer, [&](auto& b) { b.balance -= quantity; });
   }
}

void registry::remove_token(const symbol_code& ticker)
{
   token_table tokens(get_self(), get_self().value);
   auto&       token = tokens.get(ticker.raw(), "token not found");
   tokens.erase(token);
}

void registry::add_token_contract(const name& contract)
{
   contract_table contracts(get_self(), get_self().value);
   contracts.emplace(get_self(), [&](auto& row) { row.account = contract; });
}

void registry::remove_token_contract(const name& contract)
{
   contract_table contracts(get_self(), get_self().value);
   auto           itr = contracts.find(contract.value);
   check(itr != contracts.end(), "contract not found");
   contracts.erase(itr);
}

[[eosio::on_notify("*::transfer")]] void
registry::on_transfer(const name& from, const name& to, const asset& quantity, const string& memo)
{
   // ignore RAM sales
   // ignore transfers not sent to this contract
   if (from == "eosio.ram"_n || to != get_self()) {
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

   auto config = get_config();
   require_enabled(config);

   check(get_first_receiver() == config.fees.token.contract, "Incorrect token contract for deposit.");
   check(quantity.symbol == config.fees.token.symbol, "Incorrect token symbol for deposit.");
   check(quantity.amount > 0, "Token quantity must be positive.");

   add_balance(from, quantity);
}

[[eosio::action]] void registry::withdraw(const name& account, const asset& quantity)
{
   require_auth(account);

   auto config = get_config();
   require_enabled(config);

   check(quantity.symbol == config.fees.token.symbol, "Incorrect token symbol for withdraw.");
   check(quantity.amount > 0, "Token quantity must be positive.");
   remove_balance(account, quantity);

   // Send the tokens
   token::transfer_action transfer_act{config.fees.token.contract,
                                       {{get_self(), eosiosystem::system_contract::active_permission}}};
   transfer_act.send(get_self(), account, quantity, "");
}

[[eosio::action]] void
registry::regtoken(const name& creator, const symbol_code& ticker, const uint8_t& precision, const asset& payment)
{
   require_auth(creator);
   auto config = get_config();
   require_enabled(config);

   // Ensure the ticker meets the minimum length requirement
   check(ticker.length() >= config.regtoken.minlength, "token ticker is too short");

   // Prevent duplicate token registrations
   token_table tokens(get_self(), get_self().value);
   auto        token_itr = tokens.find(ticker.raw());
   check(token_itr == tokens.end(), "token is already registered");

   // Verify payment values
   check(payment.symbol == config.fees.token.symbol, "incorrect payment symbol");
   check(payment.amount == config.fees.regtoken.amount, "incorrect payment amount");

   // Verify contract balance to pay fee
   asset contract_balance = get_balance(creator, config.fees.token.symbol);
   check(contract_balance.amount >= payment.amount, "insufficient contract balance to pay registration fee");

   // Remove fee from contract balance
   remove_balance(creator, payment);

   // Transfer fee to receiver
   token::transfer_action transfer_act{config.fees.token.contract,
                                       {{get_self(), eosiosystem::system_contract::active_permission}}};
   transfer_act.send(get_self(), config.fees.receiver, payment, "token registration fee");

   // Add the token to the registry
   add_token(ticker, precision, creator, creator);
}

[[eosio::action]] void registry::setcontract(const symbol_code& ticker, const name& contract)
{
   token_table tokens(get_self(), get_self().value);
   auto        token_itr = tokens.find(ticker.raw());
   check(token_itr != tokens.end(), "token is not registered");
   require_auth(token_itr->creator);

   // Ensure the contract is whitelisted
   contract_table contracts(get_self(), get_self().value);
   auto           contract_itr = contracts.find(contract.value);
   check(contract_itr != contracts.end(), "contract is not whitelisted");

   check(token_itr->contract->value == 0, "token contract has already been set");
   tokens.modify(token_itr, same_payer, [&](auto& row) { row.contract = contract; });
}

[[eosio::action]] void registry::addtoken(const name& creator, const symbol_code& ticker, const uint8_t& precision)
{
   require_auth(get_self());
   token_table tokens(get_self(), get_self().value);
   auto        token_itr = tokens.find(ticker.raw());
   check(token_itr == tokens.end(), "token is already registered");
   add_token(ticker, precision, creator, get_self());
}

[[eosio::action]] void registry::addcontract(const name& contract)
{
   require_auth(get_self());
   contract_table contracts(get_self(), get_self().value);
   auto           itr = contracts.find(contract.value);
   check(itr == contracts.end(), "contract is already registered");
   add_token_contract(contract);
}

[[eosio::action]] void registry::rmtoken(const symbol_code& ticker)
{
   require_auth(get_self());
   remove_token(ticker);
}

[[eosio::action]] void registry::rmcontract(const name& contract)
{
   require_auth(get_self());
   remove_token_contract(contract);
}

[[eosio::action]] void registry::openbalance(const name& account)
{
   require_auth(account);
   open_balance(account);
}

[[eosio::action]] void registry::closebalance(const name& account)
{
   require_auth(account);
   close_balance(account);
}

[[eosio::action]] void registry::setconfig(const config_row& config)
{
   require_auth(get_self());
   config_table _config(get_self(), get_self().value);
   _config.set(config, get_self());
}

[[eosio::action]] void registry::enable()
{
   require_auth(get_self());
   config_table _config(get_self(), get_self().value);
   auto         config = _config.get_or_default();
   check(config.fees.token.symbol.is_valid(), "fees.token symbol must be set");
   check(config.fees.token.contract.value != 0, "fees.token contract must be set");
   check(config.fees.receiver.value != 0, "fees receiver must be set");
   check(config.fees.regtoken.amount > 0, "fees regtoken must be greater than 0");
   config.enabled = true;
   _config.set(config, get_self());
}

[[eosio::action]] void registry::disable()
{
   require_auth(get_self());
   config_table _config(get_self(), get_self().value);
   auto         config = _config.get_or_default();
   config.enabled      = false;
   _config.set(config, get_self());
}

} // namespace vaultacontracts

#ifdef DEBUG
#include "debug.cpp"
#endif
