// A prompt function that returns both prompt content and configuration
module.exports.promptWithConfig = async function ({ vars, provider }) {
  // Dynamic configuration based on the topic
  const isComplexTopic = vars.topic === 'the Roman Empire' || vars.topic === 'bob dylan';
  const temperature = isComplexTopic ? 0.9 : 0.5;
  const maxTokens = isComplexTopic ? 150 : 75;

  // Return both prompt and config
  return {
    prompt: [
      {
        role: 'system',
        content: `You're a knowledgeable historian using a ${provider.label || provider.id} model. 
                  Be factual and concise. Use at most ${maxTokens} tokens.`,
      },
      {
        role: 'user',
        content: `Tell me about ${vars.topic}`,
      },
    ],
    config: {
      temperature,
      max_tokens: maxTokens,
      top_p: 0.95,
      response_format: {
        type: 'text',
      },
    },
  };
};
