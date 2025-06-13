# node-package-typescript (Node Package TypeScript)

You can run this example with:

```bash
npx promptfoo@latest init --example node-package-typescript
```

This example demonstrates using promptfoo from a TypeScript script.

## Prerequisites

- Node.js (version 18 or higher)
- TypeScript and ts-node (installed via npm dependencies)
- API keys for LLM providers set as environment variables:
  - `OPENAI_API_KEY` - Get from [OpenAI API keys page](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/) (optional)

You can set these in a `.env` file:

```
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## Running the Example

1. Install dependencies:

```bash
npm install
```

2. Execute the script:

```bash
npx ts-node src/full-eval.ts
```

## Expected Results

The TypeScript script will:

- Run evaluations with full type safety using the promptfoo API
- Save results to `output.json`
- Display evaluation metrics in the console
- Demonstrate TypeScript integration patterns for promptfoo

View detailed results with `promptfoo view`.
