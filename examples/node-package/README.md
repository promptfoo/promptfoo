# node-package (Node Package)

You can run this example with:

```bash
npx promptfoo@latest init --example node-package
```

This example demonstrates using promptfoo from a Node.js script.

## Prerequisites

- Node.js (version 18 or higher)
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
node full-eval.js
```

## Expected Results

The script will:

- Run evaluations programmatically using the promptfoo Node.js API
- Save results to `output.json`
- Display evaluation metrics in the console
- Allow you to view detailed results with `promptfoo view`
