# Ollama Red Team Example

This example shows how to red team an Ollama model using promptfoo. For a detailed walkthrough, see the [blog post](https://promptfoo.dev/blog/red-team-ollama-model/).

## Prerequisites

1. Install Node.js version 18 or later. [Download Node.js](https://nodejs.org/en/download/)
2. Install Ollama from [ollama.ai](https://ollama.ai)
3. Start the Ollama service:

```bash
# On macOS/Linux
ollama serve

# On Windows
# Run Ollama from the installed application
```

4. Pull the model:

```bash
ollama pull llama3.2

# Verify the model is working:
ollama run llama3.2 "Hello, how are you?"
```

## Running the Example

1. Generate and run the adversarial test cases:

```bash
npx promptfoo@latest redteam run
```

2. Generate a report:

```bash
npx promptfoo@latest redteam report
```

The report will show vulnerability categories discovered, severity levels, specific test cases that exposed issues, and suggested mitigations. See the [blog post](https://promptfoo.dev/blog/red-team-ollama-model/) for example reports and screenshots.

## Configuration

The `promptfooconfig.yaml` file configures:

- Target model (Llama 3.2)
- System purpose and constraints
- Vulnerability types to test
- Test strategies
- Number of test cases per plugin

## Test Categories

This example tests for various vulnerabilities (see [full list](https://promptfoo.dev/docs/red-team/llm-vulnerability-types/)):

- Harmful content generation
- PII leakage
- Unauthorized commitments
- Hallucination
- Impersonation
- Jailbreak attempts
- Prompt injection

## Mitigating Vulnerabilities

Based on your test results, consider:

1. Adding explicit safety constraints in your system prompts
2. Implementing pre-processing to catch malicious inputs
3. Adding post-processing to filter harmful content
4. Adjusting temperature values to reduce erratic behavior

For more details, see:

- [Blog Post](https://promptfoo.dev/blog/red-team-ollama-model/)
- [Red Team Documentation](https://promptfoo.dev/docs/red-team/quickstart/)
- [Ollama Provider Guide](https://promptfoo.dev/docs/providers/ollama/)
