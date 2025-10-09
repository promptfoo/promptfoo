/**
 * Stream transform for Server-Sent Events (SSE) format over WebSocket
 * Handles text messages formatted like SSE (data: {...})
 */
module.exports = (context) => {
  const { message, messages } = context;

  // SSE messages might come as strings
  if (typeof message === 'string') {
    const lines = message.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse SSE format: "data: {...}"
      if (trimmed.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmed.slice(6));

          // Check if this is a completion signal
          if (data.done || data.type === '[DONE]') {
            // Accumulate all previous deltas
            const accumulated = [];

            for (const msg of messages) {
              if (typeof msg === 'string') {
                const msgLines = msg.split('\n');
                for (const msgLine of msgLines) {
                  if (msgLine.trim().startsWith('data: ')) {
                    try {
                      const msgData = JSON.parse(msgLine.trim().slice(6));
                      if (msgData.delta || msgData.content) {
                        accumulated.push(msgData.delta || msgData.content);
                      }
                    } catch {}
                  }
                }
              }
            }

            return {
              done: true,
              output: accumulated.join(''),
            };
          }
        } catch {
          // Invalid JSON in SSE format, ignore
        }
      }
    }
  }

  // Object format SSE
  if (typeof message === 'object') {
    if (message.done || message.type === '[DONE]') {
      // Accumulate deltas from all messages
      const deltas = messages
        .filter((m) => typeof m === 'object' && (m.delta || m.content))
        .map((m) => m.delta || m.content);

      return {
        done: true,
        output: deltas.join(''),
      };
    }
  }

  // Continue streaming
  return {};
};
