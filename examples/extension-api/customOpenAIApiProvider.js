// const promptfoo = require('../../dist/src/index.js').default;
const promptfoo = require('promptfoo').default;

class CustomOpenAIApiProvider {
  id() {
    return 'custom-openai-api-provider';
  }

  async callApi(prompt, context, options) {
    // Load trace ID from the beforeAll hook
    const [{ trace_id: traceId }] = context.extensionHookOutputs.beforeAll;

    const metadata = { customTraceId: traceId };

    // Fetch the data from the API using promptfoo's cache. You can use your own fetch implementation if preferred.
    const { data, cached } = await promptfoo.cache.fetchWithCache(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          metadata,
          store: true, // required for `metadata`.
        }),
      },
    );

    return {
      output: JSON.stringify({
        content: data.choices[0].message.content,
        metadata,
      }),
      tokenUsage: {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
    };
  }
}

module.exports = CustomOpenAIApiProvider;
