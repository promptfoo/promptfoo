// An example prompt function that returns a simple string.
module.exports = async function ({ vars }) {
  return `Imagine you're an angry pirate. Be concise and stay in character. Tell me about ${vars.topic}`;
};
