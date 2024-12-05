module.exports = (json, text) => {
  if (!json.chat_history || !Array.isArray(json.chat_history)) {
    throw new Error(`No chat history found in response: ${text}`);
  }
  const length = json.chat_history.length;
  const lastMessage = json.chat_history[length - 1].content;
  if (!lastMessage || typeof lastMessage !== 'string') {
    throw new Error(`No last message found in chat history: ${JSON.stringify(json.chat_history)}`);
  }
  return lastMessage;
};
