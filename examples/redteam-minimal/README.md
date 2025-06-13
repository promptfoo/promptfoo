# redteam-minimal (Redteam: Minimal)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-minimal
```

A minimal red team setup demonstrating basic configuration and strategies.

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

The minimal red team evaluation will:

- Run basic adversarial tests against your target system
- Check for common vulnerabilities like prompt injection and jailbreaking
- Generate a security report with findings
- Demonstrate the foundation for more advanced red team testing
