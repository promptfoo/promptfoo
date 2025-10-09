/**
 * Stream transform for OpenAI Realtime API
 * Handles audio transcript delta events
 */
module.exports = (context) => {
  const { message, messages } = context;

  // Handle different event types
  if (message.type === 'error') {
    return {
      done: true,
      error: message.error?.message || 'Unknown error occurred',
    };
  }

  // Accumulate transcript deltas
  if (message.type === 'response.audio_transcript.delta') {
    // Don't return done yet, keep accumulating
    return {};
  }

  // Stream is complete
  if (message.type === 'response.audio_transcript.done') {
    // Collect all deltas
    const transcript = messages
      .filter((m) => m.type === 'response.audio_transcript.delta' && m.delta)
      .map((m) => m.delta)
      .join('');

    return {
      done: true,
      output: transcript || message.transcript,
    };
  }

  // Response fully complete
  if (message.type === 'response.done') {
    // Try to extract from message or fall back to accumulated transcript
    const transcript = messages
      .filter((m) => m.type === 'response.audio_transcript.delta')
      .map((m) => m.delta)
      .join('');

    return {
      done: true,
      output: transcript,
    };
  }

  // Continue streaming for other message types
  return {};
};
