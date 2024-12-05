module.exports = (json, text) => {
  // Can be as simple as json.chat_history[json.chat_history.length - 1]?.content;
  // We may want to add additional validations here if the API returns
  // refusals in a different format or something unexpected.
  if (!json.chat_history || !Array.isArray(json.chat_history)) {
    throw new Error(`No chat history found in response: ${text}`);
  }
  const length = json.chat_history.length;
  const lastMessage = json.chat_history[length - 1].content;
  if (typeof lastMessage !== 'string') {
    throw new Error(`No last message found in chat history: ${JSON.stringify(json.chat_history)}`);
  }
  return lastMessage;
};
