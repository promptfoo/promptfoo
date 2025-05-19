# cerebras (Cerebras Example (High-Performance LLM Inference))

This example demonstrates how to use the Cerebras provider with promptfoo to evaluate Cerebras Inference API models, which offer high-performance inference for Llama and other LLM models.

You can run this example with:

```bash
npx promptfoo@latest init --example cerebras
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

```
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

Cerebras supports several powerful models:

- `llama-4-scout-17b-16e-instruct` - Llama 4 Scout 17B model with 16 expert MoE (featured in examples)
- `llama3.1-8b` - Llama 3.1 8B model
- `llama-3.3-70b` - Llama 3.3 70B model
- `deepSeek-r1-distill-llama-70B` (private preview)

## Pricing & Usage

Cerebras Inference API offers competitive pricing compared to other inference services. Check the [official pricing page](https://docs.cerebras.ai) for the most current rates. Usage is billed based on input and output tokens.

## Learn More

- [Cerebras Provider Documentation](https://promptfoo.dev/docs/providers/cerebras)
- [Cerebras API Reference](https://docs.cerebras.ai/)
- [Cerebras Structured Outputs Guide](https://docs.cerebras.ai/capabilities/structured-outputs/)
- [Cerebras Tool Use Guide](https://docs.cerebras.ai/capabilities/tool-use/)
