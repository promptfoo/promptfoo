# cyberseceval (CyberSecEval Example)

You can run this example with:

```bash
npx promptfoo@latest init --example cyberseceval
```

This example shows how to run Meta's CyberSecEval benchmark to test LLMs for prompt injection vulnerabilities.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure your model in `promptfooconfig.yaml`:

```yaml
providers:
  - openai:gpt-4o # OpenAI
  - anthropic:messages:claude-3-5-sonnet-20241022 # Anthropic
  - ollama:chat:llama3.3 # Ollama
  - replicate:meta/llama-2-70b-chat # Replicate
```

## Usage

Run all tests:

```

```
