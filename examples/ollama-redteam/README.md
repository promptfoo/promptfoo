# Ollama Red Team Example

This example shows how to red team an Ollama model using promptfoo.

## Prerequisites

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull the model:

```bash
ollama pull llama3.2
```

3. Install Node.js version 18 or later

## Running the Example

1. Generate and run the adversarial test cases:

```bash
npx promptfoo@latest redteam run
```

2. Generate a report:

```bash
npx promptfoo@latest redteam report
```

## Configuration

The `promptfooconfig.yaml` file configures:

- Target model (Llama 3.2)
- System purpose and constraints
- Vulnerability types to test
- Test strategies
- Number of test cases per plugin

## Test Categories

This example tests for:

- Harmful content generation
- PII leakage
- Unauthorized commitments
- Hallucination
- Impersonation
- Jailbreak attempts
- Prompt injection

## Expected Results

The report will show:

- Vulnerability categories discovered
- Severity levels
- Test cases that exposed issues
- Suggested mitigations

See the [documentation](https://promptfoo.dev/docs/red-team/quickstart/) for more details.
