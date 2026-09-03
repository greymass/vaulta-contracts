#include <sentiment/sentiment.hpp>

namespace vaultacontracts {

[[eosio::action]] void
sentiment::createtopic(const name& creator, const name& id, const string& description, const asset& payment)
{
   require_auth(creator);

   auto config = get_config();
   require_enabled(config);

   topics_table topics(get_self(), get_self().value);

   auto itr = topics.find(id.value);
   check(itr == topics.end(), "topic with this ID already exists");

   if (!has_auth(get_self())) {
      check(payment.symbol == config.fees.token.symbol, "incorrect payment symbol");
      check(payment.amount == config.fees.createtopic.amount, "incorrect payment amount");

      asset contract_balance = get_balance(creator, config.fees.token.symbol);
      check(contract_balance.amount >= payment.amount, "insufficient contract balance to pay topic creation fee");

      remove_balance(creator, payment);

      action(permission_level{get_self(), eosiosystem::system_contract::active_permission}, config.fees.token.contract,
             config.fees.action,
             std::make_tuple(get_self(), config.fees.receiver, payment, string("sentiment topic creation fee")))
         .send();
   }

   topics.emplace(creator, [&](auto& row) {
      row.id          = id;
      row.description = description;
      row.creator     = creator;
   });
}

[[eosio::action]] void sentiment::updatetopic(const name& id, const string& description)
{
   require_auth(get_self());

   topics_table topics(get_self(), get_self().value);

   auto itr = topics.find(id.value);
   check(itr != topics.end(), "topic does not exist");

   topics.modify(itr, same_payer, [&](auto& row) { row.description = description; });
}

[[eosio::action]] void sentiment::deletetopic(const name& id)
{
   require_auth(get_self());

   topics_table topics(get_self(), get_self().value);

   auto itr = topics.find(id.value);
   check(itr != topics.end(), "topic does not exist");

   // Delete all votes for this topic
   votes_table votes(get_self(), id.value);
   auto        vote_itr = votes.begin();
   while (vote_itr != votes.end()) {
      vote_itr = votes.erase(vote_itr);
   }

   topics.erase(itr);
}

[[eosio::action, eosio::read_only]] sentiment::get_topic_response sentiment::gettopic(const name& id)
{
   topics_table topics(get_self(), get_self().value);

   auto itr = topics.find(id.value);
   check(itr != topics.end(), "topic does not exist");

   return get_topic_response{.id = itr->id, .description = itr->description, .creator = itr->creator};
}

[[eosio::action, eosio::read_only]] vector<sentiment::get_topic_response> sentiment::gettopics()
{
   topics_table                          topics(get_self(), get_self().value);
   vector<sentiment::get_topic_response> results;

   for (auto itr = topics.begin(); itr != topics.end(); ++itr) {
      results.push_back(get_topic_response{.id = itr->id, .description = itr->description, .creator = itr->creator});
   }

   return results;
}

[[eosio::action]] void sentiment::votetopic(const name& voter, const name& topic_id, uint8_t vote_type)
{
   require_auth(voter);

   auto config = get_config();
   require_enabled(config);

   check(vote_type == 0 || vote_type == 1, "vote_type must be 0 (opposition) or 1 (support)");

   topics_table topics(get_self(), get_self().value);
   auto         topic_itr = topics.find(topic_id.value);
   check(topic_itr != topics.end(), "topic does not exist");

   votes_table votes(get_self(), topic_id.value);
   auto        vote_itr = votes.find(voter.value);

   if (vote_itr == votes.end()) {
      // Create new vote
      votes.emplace(voter, [&](auto& row) {
         row.voter     = voter;
         row.topic_id  = topic_id;
         row.vote_type = vote_type;
      });
   } else {
      // Update existing vote
      votes.modify(vote_itr, same_payer, [&](auto& row) { row.vote_type = vote_type; });
   }
}

// DEPRECATED: Use votetopic() instead. Kept for backwards compatibility, may be removed in future.
[[eosio::action]] void sentiment::vote(const name& voter, const name& topic_id, uint8_t vote_type)
{
   votetopic(voter, topic_id, vote_type);
}

// DEPRECATED: Use votetopic() instead. Kept for backwards compatibility, may be removed in future.
[[eosio::action]] void sentiment::changevote(const name& voter, const name& topic_id, uint8_t vote_type)
{
   require_auth(voter);

   auto config = get_config();
   require_enabled(config);

   check(vote_type == 0 || vote_type == 1, "vote_type must be 0 (opposition) or 1 (support)");

   topics_table topics(get_self(), get_self().value);
   auto         topic_itr = topics.find(topic_id.value);
   check(topic_itr != topics.end(), "topic does not exist");

   votes_table votes(get_self(), topic_id.value);
   auto        vote_itr = votes.find(voter.value);
   check(vote_itr != votes.end(), "vote does not exist, use vote to create");

   uint8_t old_vote_type = vote_itr->vote_type;
   check(old_vote_type != vote_type, "new vote type is the same as current vote type");

   votes.modify(vote_itr, same_payer, [&](auto& row) { row.vote_type = vote_type; });
}

[[eosio::action]] void sentiment::rmtopicvote(const name& voter, const name& topic_id)
{
   require_auth(voter);

   auto config = get_config();
   require_enabled(config);

   topics_table topics(get_self(), get_self().value);
   auto         topic_itr = topics.find(topic_id.value);
   check(topic_itr != topics.end(), "topic does not exist");

   votes_table votes(get_self(), topic_id.value);
   auto        vote_itr = votes.find(voter.value);
   check(vote_itr != votes.end(), "vote does not exist");

   votes.erase(vote_itr);
}

// DEPRECATED: Use rmtopicvote() instead. Kept for backwards compatibility, may be removed in future.
[[eosio::action]] void sentiment::removevote(const name& voter, const name& topic_id) { rmtopicvote(voter, topic_id); }

[[eosio::action]] void sentiment::bulkrmvotes(const name& topic_id, uint32_t num_votes)
{
   require_auth(get_self());

   topics_table topics(get_self(), get_self().value);
   auto         topic_itr = topics.find(topic_id.value);
   check(topic_itr != topics.end(), "topic does not exist");

   votes_table votes(get_self(), topic_id.value);
   auto        vote_itr = votes.begin();
   uint32_t    deleted  = 0;

   while (vote_itr != votes.end() && deleted < num_votes) {
      vote_itr = votes.erase(vote_itr);
      deleted++;
   }
}

[[eosio::action, eosio::read_only]] sentiment::get_topic_vote_response sentiment::gettopicvote(const name& voter,
                                                                                               const name& topic_id)
{
   votes_table votes(get_self(), topic_id.value);
   auto        vote_itr = votes.find(voter.value);
   check(vote_itr != votes.end(), "vote does not exist");

   return get_topic_vote_response{
      .voter = vote_itr->voter, .topic_id = vote_itr->topic_id, .vote_type = vote_itr->vote_type};
}

// DEPRECATED: Use gettopicvote() instead. Kept for backwards compatibility, may be removed in future.
[[eosio::action, eosio::read_only]] sentiment::get_topic_vote_response sentiment::getvote(const name& voter,
                                                                                          const name& topic_id)
{
   return gettopicvote(voter, topic_id);
}

[[eosio::action, eosio::read_only]] vector<sentiment::get_topic_vote_response>
sentiment::gettopicvtrs(const name& topic_id)
{
   topics_table topics(get_self(), get_self().value);
   auto         topic_itr = topics.find(topic_id.value);
   check(topic_itr != topics.end(), "topic does not exist");

   votes_table                                votes(get_self(), topic_id.value);
   vector<sentiment::get_topic_vote_response> results;

   for (auto itr = votes.begin(); itr != votes.end(); ++itr) {
      results.push_back(
         get_topic_vote_response{.voter = itr->voter, .topic_id = itr->topic_id, .vote_type = itr->vote_type});
   }

   return results;
}

// DEPRECATED: Use gettopicvtrs() instead. Kept for backwards compatibility, may be removed in future.
[[eosio::action, eosio::read_only]] vector<sentiment::get_topic_vote_response>
sentiment::getvoters(const name& topic_id)
{
   return gettopicvtrs(topic_id);
}

} // namespace vaultacontracts
