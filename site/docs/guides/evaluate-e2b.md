---
title: Evaluate Code with E2B
sidebar_label: Evaluate Code with E2B
description: Run LLM-generated Python in an E2B sandbox and score its output with promptfoo.
keywords: [E2B evaluation, E2B sandbox, LLM code execution, code generation evaluation]
---

# Evaluate Code with E2B

When an evaluation asks a model to generate executable code, do not execute that
output directly on the machine running promptfoo. This guide uses
[E2B](https://e2b.dev/docs) to execute generated Python in a temporary sandbox,
while a promptfoo Python assertion checks the result.

The runnable example lives in
[`examples/integration-e2b`](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-e2b).
It evaluates small Python functions, executes them in E2B with internet access
disabled, checks several hidden inputs per generated function, and records
per-test metrics.

## Execution Flow

1. Promptfoo supplies a coding task to an LLM.
2. The provider returns a Python function.
3. A Python assertion extracts the function and rejects a small set of risky
   APIs as a defense-in-depth check.
4. The assertion starts an E2B sandbox with internet access disabled and runs
   the function with a five-second execution timeout.
5. Promptfoo compares stdout for several hidden cases to their expected
   results and records pass or fail.

The static check is illustrative only. It is not a complete security policy.
The security boundary for generated execution is the sandbox, its network
policy, and any additional template or account controls you configure in E2B.

## Prerequisites

- Node.js supported by promptfoo
- Python 3.10 or newer
- An E2B API key
- An API key for your selected LLM provider

## Run The Example

Scaffold the example and enter its directory:

```bash
npx promptfoo@latest init --example integration-e2b
cd integration-e2b
```

Create a Python virtual environment and install the E2B SDK:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install 'e2b-code-interpreter==2.7.0'
```

Export the credentials and tell promptfoo to use that virtual environment for
Python assertions:

```bash
export E2B_API_KEY="e2b_your_key"
export OPENAI_API_KEY="sk_your_key"
export PROMPTFOO_PYTHON="$PWD/.venv/bin/python"
```

Run a fresh evaluation and export the result:

```bash
npx promptfoo eval --no-cache -o output.json
```

Inspect `output.json` for individual pass/fail results, scores, and errors. To
explore results in the local viewer:

```bash
npx promptfoo view
```

## Example Files

The example uses these files:

- [`promptfooconfig.yaml`](https://github.com/promptfoo/promptfoo/blob/main/examples/integration-e2b/promptfooconfig.yaml)
  selects a model, declares coding tasks, and loads the Python assertion.
- [`code_generation_prompt_fs.txt`](https://github.com/promptfoo/promptfoo/blob/main/examples/integration-e2b/code_generation_prompt_fs.txt)
  instructs the model to return a Python function.
- [`validate_and_run_code_e2b.py`](https://github.com/promptfoo/promptfoo/blob/main/examples/integration-e2b/validate_and_run_code_e2b.py)
  extracts code, starts the E2B sandbox, executes it, and scores stdout.
- [`metrics.py`](https://github.com/promptfoo/promptfoo/blob/main/examples/integration-e2b/metrics.py)
  writes structured metric files after each assertion.
- [`report.py`](https://github.com/promptfoo/promptfoo/blob/main/examples/integration-e2b/report.py)
  can turn captured metrics into a Markdown report.

The key execution call is deliberately small:

```python
with Sandbox.create(allow_internet_access=False) as sandbox:
    execution = sandbox.run_code(test_program, language="python", timeout=5)
```

`allow_internet_access=False` is applied when creating the sandbox. `timeout=5`
limits this individual code execution. For stricter resource, package, or
egress policies, create an appropriate E2B template and use it from the
assertion.

## Customize The Eval

Add a coding task with multiple hidden cases under `tests` in
`promptfooconfig.yaml`:

```yaml
- vars:
    problem: 'Write a Python function that returns the sum of a list'
    function_name: 'sum_values'
    test_cases:
      - input: '[2, 3, 5]'
        expected: '10'
      - input: '[]'
        expected: '0'
      - input: '[-2, 8]'
        expected: '6'
```

You can also replace `openai:chat:gpt-5.4-mini` with another
[provider](/docs/providers) to compare code-generation quality using the same
sandboxed test cases.

## Red Teaming Code-Executing Applications

This example is an evaluation assertion, not an application target. To red
team an application that accepts and executes model-generated code, expose the
application through a supported promptfoo target and configure plugins and
strategies for its threat model. See the [red team quickstart](/docs/red-team/quickstart/)
for target configuration and attack generation.

## Related Guides

- [Sandboxed Code Evaluations](/docs/guides/sandboxed-code-evals) uses a local
  Docker-based sandbox.
- [Evaluating Coding Agents](/docs/guides/evaluate-coding-agents) covers
  broader repository-editing workflows.
