/**
 * Transforms module for promptfoo testing
 *
 * These functions handle converting between promptfoo's format and the
 * chat API's expected format.
 */

module.exports = {
  /**
   * Transform promptfoo prompts into the format expected by our chat API
   *
   * @param {string} prompt - The prompt from promptfoo
   * @returns {Array} Formatted chat history in OpenAI format
   */
  request: (prompt) => {
    // Check if the prompt is already in OpenAI format (from multi-turn strategies)
    try {
      // Handle array format from simulatedUser
      const parsed = JSON.parse(prompt);

      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && 'role' in parsed[0]) {
          // Already in the correct format
          return parsed;
        }
      }
    } catch (e) {
      // Not valid JSON, treat as a string prompt
    }

    // Convert a single string to a simple user message
    return [{ role: 'user', content: prompt }];
  },

  /**
   * Extract the assistant's response from the chat API result
   *
   * @param {Object} json - The parsed JSON response
   * @param {string} text - The raw response text
   * @returns {string} The extracted assistant response
   */
  response: (json, text) => {
    // Check for errors
    if (json.error) {
      // Critical errors - throw to fail the test
      const criticalErrorTypes = ['authentication', 'rate_limit'];
      if (
        criticalErrorTypes.includes(json.error_type) ||
        json.error.includes('API key') ||
        json.error.includes('authentication')
      ) {
        throw new Error(`Error (${json.error_type}): ${json.error}`);
      }

      // Non-critical errors - return as text (test can decide if it passes)
      return `Error (${json.error_type || 'unknown'}): ${json.error}`;
    }

    // Validate the response format
    if (!json.chat_history || !Array.isArray(json.chat_history)) {
      throw new Error(`No chat history found in response: ${text}`);
    }

    // Get the last assistant message in the history
    const length = json.chat_history.length;
    let lastAssistantMessageIndex = length - 1;

    // Scan backward to find the most recent valid assistant message
    while (lastAssistantMessageIndex >= 0) {
      const message = json.chat_history[lastAssistantMessageIndex];
      if (message.role === 'assistant' && message.content) {
        return message.content;
      }
      lastAssistantMessageIndex--;
    }

    throw new Error(`No valid assistant message found in the response`);
  },
};
