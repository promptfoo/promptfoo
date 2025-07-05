# provider-aiml-api

This example shows how to use AI/ML API to compare different language models on a fun task - telling jokes!

AI/ML API provides access to 300+ models through a single API key, making it easy to compare models from different providers.

## Setup

1. Get your API key from [AI/ML API](https://aimlapi.com)

2. Set your API key:

   ```bash
   export AIML_API_KEY=your_api_key_here
   ```

3. Run the evaluation:
   ```bash
   npx promptfoo@latest eval
   ```

## What this example does

This example compares three different models:

- **DeepSeek R1** - Advanced reasoning model
- **GPT-4.1 Mini** - Fast and cost-effective
- **Claude 4 Sonnet** - Balanced performance

The models are asked to tell jokes about different topics, and we evaluate:

- Whether the joke contains relevant keywords
- Whether the joke is actually funny (using an LLM judge)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-aiml-api
```
