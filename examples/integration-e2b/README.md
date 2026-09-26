# integration-e2b (E2B Code Evaluation)

## What This Example Demonstrates

This example shows a complete prompt→LLM→sandboxed-execution→metric pipeline using:

- `promptfoo` to run LLM prompts and manage evaluation cases.
- An LLM provider to generate Python functions from a short problem prompt.
- e2b sandboxes (via `e2b-code-interpreter`) to run generated code safely.
- Per-run JSON metrics written to .promptfoo_results/ and a human-friendly markdown report produced by report.py.

You can run this example with:

```bash
npx promptfoo@latest init --example integration-e2b
cd integration-e2b
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

Use Python 3.10 or newer. Create a virtual environment and install the one required Python SDK. Promptfoo calls the model through its Node provider; the Python OpenAI SDK is not needed.

```bash
# create & activate venv
python -m venv .venv
source .venv/bin/activate

# install Python packages
python -m pip install 'e2b-code-interpreter>=2.10.0,<3'
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
promptfoo eval --no-cache -o results.json
```

Open the interactive viewer:

```bash
promptfoo view
```

## Sandbox settings and results

The validator creates each E2B sandbox with outbound internet access disabled and a
60-second lifetime, then requests a 5-second code-execution timeout. CPU and memory
allocation come from the E2B template; this example does not claim per-execution
CPU or memory limits. SDK or sandbox errors fail the assertion without retrying
with weaker settings. Generated code runs only inside E2B.

The static pattern check is illustrative, not a complete Python security filter.
The protected-file test intentionally fails when the precheck rejects its code.
The negative factorial test passes only when execution raises `ValueError`. Inspect
`results.json` and `.promptfoo_results/` to distinguish expected rejections, wrong
answers, and sandbox failures. API access and E2B credits are required for the live
example.

Generate a Markdown report from the per-test metrics with `python report.py`.
Run the local regression tests without cloud requests:

```bash
python -m unittest discover -s . -p '*_test.py'
```
