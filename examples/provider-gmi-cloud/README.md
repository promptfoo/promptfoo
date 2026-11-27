# provider-gmi-cloud (GMI Cloud Ticket Routing)

Compare Qwen3.8 Flash and DeepSeek V4 Flash on four synthetic support tickets. Both models run through [GMI Cloud Inference Engine](https://docs.gmicloud.ai/inference-engine/api-reference/llm-api-reference) using Promptfoo's OpenAI Chat Completions provider.

## Setup

1. Create a GMI Cloud Inference Engine API key and export it locally:

   ```bash
   export GMI_API_KEY=your_gmi_api_key
   ```

2. Initialize and run the example:

   ```bash
   npx promptfoo@latest init --example provider-gmi-cloud
   cd provider-gmi-cloud
   npx promptfoo@latest eval
   npx promptfoo@latest view
   ```

Each run evaluates two models on four tickets. Both requests use the same JSON schema for structured output. The assertions validate the schema and compare each `queue` and `priority` with the expected values. The results viewer shows which model passed each ticket and lets you inspect the outputs side by side.

If a model is unavailable to your account, replace the model name after `openai:chat:` with a Chat Completions model ID from the GMI Cloud catalog that supports JSON Schema structured outputs.
