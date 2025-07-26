# redteam-bestOfN-strategy (Redteam: Best-of-N Strategy)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-bestOfN-strategy
```

This example runs a red team using the `best-of-n` attack strategy to generate multiple adversarial prompts.

## Prerequisites

- API keys for LLM providers set as environment variables:
  - `OPENAI_API_KEY` - Get from [OpenAI API keys page](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/) (optional)
- A target application or system to test (configured in `promptfooconfig.yaml`)

## Quick Start

Run the red team evaluation:

```bash
promptfoo redteam run
```

## Expected Results

The red team evaluation will:

- Generate multiple adversarial prompts using the best-of-N strategy
- Test your target system with various attack vectors
- Produce a detailed report showing vulnerabilities found
- Save results that can be viewed with `promptfoo view`
