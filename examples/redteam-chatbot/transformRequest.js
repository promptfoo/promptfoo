module.exports = (prompt) => {
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
};
