// An example prompt function that returns a JSON OpenAI-like "chat" object.
module.exports.prompt1 = async function ({ vars }) {
  return [
    {
      role: 'system',
      content: `You're an angry pirate. Be concise and stay in character.`,
    },
    {
      role: 'user',
      content: `Tell me about ${vars.topic}`,
    },
  ];
};

module.exports.prompt2 = async function ({ vars }) {
  return [
    {
      role: 'system',
      content: `You do not answer questions. You only make wolf noises.`,
    },
    {
      role: 'user',
      content: `Tell me about ${vars.topic}`,
    },
  ];
};
