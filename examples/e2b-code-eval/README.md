# e2b Code Eval — step-by-step sandboxed code-eval example

## What This Example Demonstrates

This example shows a complete prompt→LLM→sandboxed-execution→metric pipeline using:

- `promptfoo` to run LLM prompts and manage evaluation cases.
- An LLM provider to generate Python functions from a short problem prompt.
- e2b sandboxes (via `e2b-code-interpreter`) to run generated code safely.
- OpenAI step to generate small verification unit tests and re-run them in the sandbox.
- Per-run JSON metrics written to .promptfoo_results/ and a human-friendly markdown report produced by report.py.

You can run this example with:

```bash
npx promptfoo@latest init --example e2b-code-eval
```

## Environment Variables

Set these in your shell before running the example.

```bash
# Required
export E2B_API_KEY="e2b_xxx_your_key_here"        # e2b sandbox API key
export OPENAI_API_KEY="sk_xxx_your_key_here"     # OpenAI key (or your chosen LLM provider)

# Recommended
export PROMPTFOO_PYTHON="$(pwd)/.venv/bin/python"  # tell promptfoo which Python/venv to use
```

- If you use a different provider name in promptfooconfig.yaml, add that provider's key instead.

## Prerequisites

Install and prepare a Python virtual environment, and install the required packages.

```bash
# create & activate venv
python -m venv .venv
source .venv/bin/activate

# install Python packages
pip install --upgrade pip
pip install e2b-code-interpreter
npm i -g promptfoo
```

## Running the Example

Activate venv and ensure env vars are set:

```bash
source .venv/bin/activate
export E2B_API_KEY="e2b_xxx"
export OPENAI_API_KEY="sk_xxx"
export PROMPTFOO_PYTHON="$(pwd)/.venv/bin/python"
```

Run the evaluation:

```bash
promptfoo eval
```

Open the interactive viewer:

```bash
promptfoo view
```
