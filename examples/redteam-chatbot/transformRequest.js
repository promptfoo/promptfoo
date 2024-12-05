module.exports = (prompt) => {
  console.log(`request transform: type: ${typeof prompt}, value: ${prompt}`);
  let messages = prompt;
  if (typeof prompt === 'string') {
    try {
      messages = JSON.parse(prompt);
    } catch (e) {
      // Not JSON, keep original prompt
    }
  }
  if (Array.isArray(messages)) {
    return {
      api_provider: 'groq',
      chat_history: messages,
    };
  }
  return {
    api_provider: 'groq',
    chat_history: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };
};
