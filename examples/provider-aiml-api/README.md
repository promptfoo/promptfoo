# provider-aiml-api (AI/ML API Provider)

Compare three models on a joke-writing task through [AI/ML API](https://aimlapi.com). The configuration uses:

- DeepSeek V4 Pro (`deepseek/deepseek-v4-pro`)
- GPT-5.6 Luna (`openai/gpt-5.6-luna`)
- Claude Sonnet 5 (`anthropic/claude-sonnet-5`)

## Setup

1. Create the example:

   ```bash
   npx promptfoo@latest init --example provider-aiml-api
   cd provider-aiml-api
   ```

2. Get an [AI/ML API key](https://aimlapi.com) and set it in your environment:

   ```bash
   export AIML_API_KEY=your_api_key_here
   ```

3. Run the evaluation:

   ```bash
   npx promptfoo@latest eval
   ```

## What the evaluation checks

Each model writes jokes about programming and artificial intelligence. The assertions check for relevant keywords and ask GPT-5.6 Luna, also through AI/ML API, to grade the jokes against the rubrics in the config. The grader uses the same `AIML_API_KEY` and makes separate model calls.
