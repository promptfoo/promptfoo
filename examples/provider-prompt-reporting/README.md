# provider-prompt-reporting (Provider Prompt Reporting)

Demonstrates how custom providers can report the **actual prompt** they sent to the LLM using the `prompt` field in `ProviderResponse`.

## The Problem

Modern LLM frameworks like [Vercel AI SDK](https://ai-sdk.dev), [LangChain](https://js.langchain.com), and agent systems dynamically construct prompts with:

- System instructions
- Few-shot examples
- Retrieved context (RAG)
- Tool definitions
- Conversation history

Without prompt reporting, promptfoo shows the raw template instead of the actual prompt. This breaks:

- Prompt-based assertions
- UI debugging experience
- Moderation checks

## The Solution

Providers include a `prompt` field in their response:

```javascript
return {
  output: "The LLM's response",
  prompt: [
    { role: 'system', content: 'You are a helpful assistant...' },
    { role: 'user', content: 'The actual user prompt with context...' },
  ],
};
```

This prompt is used for:

1. **Assertions** - Prompt-based checks see the real prompt
2. **UI Display** - Shows "Actual Prompt Sent" in the results
3. **Moderation** - Checks the actual content for policy violations

## Running the Example

```bash
# Initialize this example
npx promptfoo@latest init --example provider-prompt-reporting
cd provider-prompt-reporting

# Run with mock provider (no API key needed)
npx promptfoo@latest eval

# Run with real AI SDK provider (requires OpenAI key)
npm install ai @ai-sdk/openai
OPENAI_API_KEY=your-key npx promptfoo@latest eval --providers file://./aiSdkProvider.mjs
```

## Files

| File | Description |
|------|-------------|
| `aiSdkProvider.mjs` | Real provider using [Vercel AI SDK](https://ai-sdk.dev) |
| `mockProvider.mjs` | Mock provider for testing without API keys |
| `promptfooconfig.yaml` | Example configuration with test cases |

## How It Works

The providers dynamically construct prompts based on variables:

```javascript
// Variables from test case
const vars = { topic: 'quantum computing', audience: 'students' };

// Dynamic prompt construction
const systemPrompt = 'You are an expert assistant...';
const userPrompt = `Explain ${vars.topic} for ${vars.audience}`;

// Report the actual prompt
return {
  output: result.text,
  prompt: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
};
```

## Use Cases

- **Vercel AI SDK** - Report prompts with system instructions and tools
- **LangChain** - Report chain outputs with retrieved context
- **Agent frameworks** - Report the final prompt after tool planning
- **RAG pipelines** - Report prompts with retrieved documents
- **Prompt optimization** - Report the optimized variant used
