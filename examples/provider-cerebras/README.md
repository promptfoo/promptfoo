# provider-cerebras (Cerebras Example (High-Performance LLM Inference))

This example demonstrates how to use the Cerebras provider with promptfoo to evaluate models on the high-performance Cerebras Inference API.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-cerebras
cd provider-cerebras
```

## Prerequisites

### API Key Setup

1. Sign up for an account at [Cerebras AI](https://console.cerebras.ai/)
2. Navigate to your account settings to generate an API key
3. Set your Cerebras API key as an environment variable:

```bash
export CEREBRAS_API_KEY="your-api-key-here"
```

Alternatively, you can add it to your `.env` file:

```text
CEREBRAS_API_KEY=your-api-key-here
```

## Example Configurations

This repository contains three example configurations demonstrating different Cerebras features:

### 1. Basic Model Evaluation (`promptfooconfig.yaml`)

This configuration evaluates two Cerebras models on their ability to explain complex concepts in simple terms.

```bash
promptfoo eval
```

**Expected output:** You'll see a comparison of how each model explains concepts from different domains, with metrics on clarity, accuracy, and response time.

### 2. Structured Outputs (`promptfooconfig-structured.yaml`)

The structured output example demonstrates Cerebras's JSON schema enforcement capabilities, ensuring the model returns consistent, structured recipe data with proper types and required fields.

```bash
promptfoo eval -c promptfooconfig-structured.yaml
```

**Expected output:** You'll receive structured JSON outputs for different recipes, with consistent fields like cuisine type, difficulty level, ingredients, and cooking instructions - all following the defined schema.

Example output:

```json
{
  "name": "Traditional Pasta Carbonara",
  "cuisine": "Italian",
  "difficulty": "medium",
  "prepTime": 15,
  "cookTime": 20,
  "ingredients": [
    { "name": "spaghetti", "amount": "400g" },
    { "name": "pancetta", "amount": "150g" },
    { "name": "eggs", "amount": "3 large" },
    { "name": "parmesan cheese", "amount": "50g" }
  ],
  "instructions": [
    "Bring a large pot of salted water to boil",
    "Cook spaghetti according to package instructions",
    "In a separate pan, cook pancetta until crispy",
    "In a bowl, whisk eggs and grated parmesan cheese",
    "Drain pasta, reserving some pasta water",
    "Toss hot pasta with pancetta, then quickly mix in egg mixture",
    "Add pasta water as needed to create a silky sauce"
  ]
}
```

### 3. Tool Use (`promptfooconfig-tools.yaml`)

The tool use example demonstrates Cerebras's function calling capabilities with a calculator tool that the model can use to solve math problems.

```bash
promptfoo eval -c promptfooconfig-tools.yaml
```

**Expected output:** The model will use the calculator tool to solve math problems and provide step-by-step explanations of the solution process. For example, when given "15 × 7", it will calculate 105 and explain multiplication concepts.

## Model Capabilities

Cerebras currently supports these models on its public endpoints:

- `gpt-oss-120b` - Production model
- `gemma-4-31b` - Preview model
- `zai-glm-4.7` - Preview model scheduled for deprecation on August 17, 2026

The preview lineup can change on short notice. Check the [official model catalog](https://inference-docs.cerebras.ai/models/overview) for the current list.

## Pricing & Usage

Cerebras Inference API usage is billed based on input and output tokens:

- `gpt-oss-120b`: $0.35 input / $0.75 output per 1M tokens
- `gemma-4-31b`: $0.99 input / $1.49 output per 1M tokens
- `zai-glm-4.7`: $2.25 input / $2.75 output per 1M tokens

Check the [official model catalog](https://inference-docs.cerebras.ai/models/overview) for current pricing.

## Learn More

- [Cerebras Provider Documentation](https://promptfoo.dev/docs/providers/cerebras)
- [Cerebras API Reference](https://inference-docs.cerebras.ai/)
- [Cerebras Structured Outputs Guide](https://inference-docs.cerebras.ai/capabilities/structured-outputs/)
- [Cerebras Tool Use Guide](https://inference-docs.cerebras.ai/capabilities/tool-use/)
