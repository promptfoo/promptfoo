# integration-e2b (E2B Code Evaluation)

This example evaluates LLM-generated Python functions in an [E2B](https://e2b.dev/docs)
sandbox from a promptfoo Python assertion. It checks several hidden inputs per
function and records per-test metrics in `.promptfoo_results/`.

## Setup

Use Python 3.10 or newer. Scaffold the example and install its Python SDK:

```bash
npx promptfoo@latest init --example integration-e2b
cd integration-e2b

python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

export E2B_API_KEY="e2b_your_key"
export OPENAI_API_KEY="sk_your_key"
export PROMPTFOO_PYTHON="$PWD/.venv/bin/python"
```

On Windows PowerShell, use `py -3 -m venv .venv`, activate with
`.\.venv\Scripts\Activate.ps1`, and set environment variables with `$env:NAME = 'value'`.
Set `$env:PROMPTFOO_PYTHON = "$PWD\.venv\Scripts\python.exe"`.

If you select another provider in `promptfooconfig.yaml`, set that provider's
credentials instead of `OPENAI_API_KEY`. Promptfoo calls the model through its
Node provider; the Python OpenAI SDK is not needed. Live runs require API access
and E2B credits.

## Run

Run a fresh evaluation and export its results:

```bash
npx promptfoo eval --no-cache -o output.json
```

Inspect `output.json` for individual pass/fail results, scores, and errors. You
can also open the local viewer with `npx promptfoo view`.

Generate a Markdown summary from the collected metric files with `python report.py`.
Each assertion writes a separate JSON file, preserving task, provider, and model
labels even when a task runs repeatedly.

## Sandbox settings and results

The assertion creates a sandbox with outbound internet access disabled and a
60-second lifetime. It requests the SDK's five-second execution-request timeout;
this is a transport setting, not a hard five-second wall-clock deadline.
Transports can combine timeout phases into a longer request deadline. The sandbox
lifetime is a separate limit, and CPU/memory allocation comes from the E2B template.
Creation, execution, and cleanup errors fail the assertion without retrying with
weaker settings. Generated code runs only inside E2B.

For `test_cases`, the assertion prints each return value and compares the complete
stdout stream, including one newline per call. Empty strings and whitespace are
significant. These scalar examples do not isolate or frame individual results for
multiline return values. Keep generated functions free of extra stdout logging.
The legacy `test_input`/`expected_output` pair remains supported. For expected
exceptions, use a single `test_input` with `expected_error`, as the negative
factorial example does; `expected_error` cannot be combined with `test_cases`.

The static pattern check is illustrative, not a complete Python security filter.
The protected-file probe intentionally fails when the precheck rejects its code.
Indirect reads such as `open(path)` can pass that check and execute inside E2B.
Inspect the assertion reason to distinguish precheck rejection, wrong answers,
expected exceptions, and sandbox errors. Configure E2B templates and network
policies for your workload.

Run the regression tests without cloud requests:

```bash
python -m unittest discover -s . -p '*_test.py'
```
