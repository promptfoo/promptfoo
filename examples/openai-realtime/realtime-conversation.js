/**
 * This function generates a properly formatted conversation for the OpenAI Realtime API.
 * It handles the _conversation variable to maintain conversation history.
 */
module.exports = async function ({ vars, provider }) {
  // Create the messages array starting with system message
  const messages = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: vars.system_message || 'You are a helpful AI assistant.',
        },
      ],
    },
  ];

  // Add previous conversation turns if they exist
  if (vars._conversation && Array.isArray(vars._conversation)) {
    for (const completion of vars._conversation) {
      // Add user message with input_text type (for user inputs)
      messages.push({
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: completion.input,
          },
        ],
      });

      // Add assistant message with text type (for outputs)
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: completion.output,
          },
        ],
      });
    }
  }

  // Add the current question as the final user message
  messages.push({
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: vars.question || '',
      },
    ],
  });

  return messages;
};
