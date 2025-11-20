/**
 * Transform function to convert OpenAI message arrays to formatted markdown.
 *
 * Use this as a provider-level transform when using messages: format in promptfoo.yaml
 *
 * Example config:
 *
 * providers:
 *   - id: openai:responses:gpt-4.1
 *     config:
 *       transform: file://./format-messages.js
 */

function formatMessage(message) {
  if (!message || typeof message !== 'object') {
    return String(message);
  }

  // Handle message with role and content
  if (message.role && message.content) {
    const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);

    // Handle array content (OpenAI format)
    if (Array.isArray(message.content)) {
      const textParts = message.content
        .filter(item => item.type === 'text' || item.type === 'output_text')
        .map(item => item.text)
        .join('\n\n');

      return `**${role}:**\n\n${textParts}`;
    }

    // Handle string content
    if (typeof message.content === 'string') {
      return `**${role}:**\n\n${message.content}`;
    }
  }

  // Fallback: return as formatted JSON
  return JSON.stringify(message, null, 2);
}

module.exports = function transform(output, context) {
  // If output is already a string, return as-is
  if (typeof output === 'string') {
    return output;
  }

  // If output is a single message object
  if (output && output.role && output.content) {
    return formatMessage(output);
  }

  // If output is an array of messages
  if (Array.isArray(output)) {
    return output
      .map(msg => formatMessage(msg))
      .filter(text => text.trim().length > 0)
      .join('\n\n---\n\n');
  }

  // Fallback: return as formatted JSON
  return JSON.stringify(output, null, 2);
};
