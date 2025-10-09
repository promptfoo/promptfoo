/**
 * Simple chunk-based streaming transform
 * Works with any format that has 'chunk' type and 'done' type messages
 */
module.exports = (context) => {
  const { message, messages } = context;

  // Check for completion
  if (message.type === 'done' || message.type === 'complete') {
    // Accumulate all chunks
    const chunks = messages
      .filter((m) => m.type === 'chunk' && m.delta)
      .map((m) => m.delta);

    return {
      done: true,
      output: message.content || chunks.join(''),
    };
  }

  // Check for errors
  if (message.type === 'error') {
    return {
      done: true,
      error: message.error || 'Stream error occurred',
    };
  }

  // Continue streaming
  return {};
};
