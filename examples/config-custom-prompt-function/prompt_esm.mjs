// An example prompt function that returns a JSON OpenAI-like "chat" object.
export default async function ({ vars }) {
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
}
