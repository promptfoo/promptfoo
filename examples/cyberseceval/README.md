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

```bash
npx promptfoo eval
```

Run a sample of tests:

```bash
npx promptfoo eval --filter-sample 30
```

View results:

```bash
npx promptfoo view
```

## Configuration

The example includes:

- `promptfooconfig.yaml`: Main configuration file
- `prompt.json`: System prompt for the model
- `prompt_injection.json`: CyberSecEval test cases

## Learn More

- [CyberSecEval Documentation](https://meta-llama.github.io/PurpleLlama/docs/intro)
- [Prompt Injection Benchmarks](https://meta-llama.github.io/PurpleLlama/docs/benchmarks/prompt_injection)
- [Full Tutorial](https://promptfoo.dev/blog/cyberseceval)
