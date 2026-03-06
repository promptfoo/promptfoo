/**
 * This function generates a properly formatted conversation for the Amazon Bedrock Nova Sonic model.
 * It handles the _conversation variable to maintain conversation history.
 *
 * @typedef {Object} Vars
 * @property {string} [system_message] - System message to set the assistant's behavior
 * @property {string} [audio_file] - Path to the audio file to be processed
 * @property {Array<Object>} [_conversation] - Previous conversation history
 * @property {string} [_conversation[].output] - The assistant's previous response
 * @property {Object} [_conversation[].metadata] - Metadata about the previous response
 * @property {string} [_conversation[].metadata.userTranscript] - Transcript of the user's previous input
 *
 * @param {Object} provider - The provider configuration
 * @returns {Object} The formatted conversation for Nova Sonic
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
            text: completion?.metadata?.userTranscript || '',
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
        type: 'audio',
        text: vars.audio_file || '',
      },
    ],
  });

  return messages;
};
