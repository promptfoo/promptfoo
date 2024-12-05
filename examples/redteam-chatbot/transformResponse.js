module.exports = (json, text) => {
  console.log(`response transform: ${JSON.stringify(json, null, 2)}`);
  if (!json.chat_history) {
    throw new Error(`No chat history found in response: ${text}`);
  }
  const length = json.chat_history.length;
  return json.chat_history[length - 1].content;
};
