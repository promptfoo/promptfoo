module.exports = {
  request: (prompt) => {
    // Most plugins return a string which we need to convert to OpenAI format.
    // Multi-turn strategies like GOAT and Crescendo return the entire chat
    // history in OpenAI format. We can just return the string as is.
    try {
      JSON.parse(prompt); // Throws error if prompt is not valid JSON
      // We can add additional validation here if needed
      // Array.isArray(prompt) && prompt.every(msg => msg.role && msg.content)
      return prompt;
    } catch {
      return JSON.stringify([{ role: 'user', content: prompt }]);
    }
  },
  response: (json, text) => {
    // Can be as simple as json.chat_history[json.chat_history.length - 1]?.content;
    // We may want to add additional validations here if the API returns
    // refusals in a different format or something unexpected.
    if (!json.chat_history || !Array.isArray(json.chat_history)) {
      throw new Error(`No chat history found in response: ${text}`);
    }
    const length = json.chat_history.length;
    const lastMessage = json.chat_history[length - 1].content;
    if (typeof lastMessage !== 'string') {
      throw new Error(
        `No last message found in chat history: ${JSON.stringify(json.chat_history)}`,
      );
    }
    return lastMessage;
  },
};
