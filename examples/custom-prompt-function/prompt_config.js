// A prompt function that returns both prompt content and configuration
module.exports.promptWithConfig = async function ({ vars, provider }) {
  // Dynamic configuration based on the topic
  let temperature = 0.7;
  let maxTokens = 100;

  // Example of adjusting config based on topic complexity
  if (vars.topic === 'the Roman Empire' || vars.topic === 'bob dylan') {
    // More complex topics get more freedom in generation
    temperature = 0.9;
    maxTokens = 150;
  } else {
    // Simpler topics get more constrained generation
    temperature = 0.5;
    maxTokens = 75;
  }

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
