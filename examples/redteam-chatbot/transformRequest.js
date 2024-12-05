module.exports = (prompt) => {
  if (typeof prompt === 'string') {
    try {
      const messages = JSON.parse(prompt);
      if (Array.isArray(messages)) {
        if (
          !messages.every(
            (message) => message.role && message.content && typeof message.content === 'string' && typeof message.role === 'string',
          )
        ) {
          throw new Error(`Invalid chat history: ${JSON.stringify(messages)}`);
        }
        return {
          api_provider: 'groq',
          chat_history: messages,
        };
      }
    } catch {}
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
