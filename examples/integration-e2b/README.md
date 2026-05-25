# integration-e2b (E2B Code Evaluation)

This example evaluates LLM-generated Python functions by executing them in an
[E2B](https://e2b.dev/docs) sandbox from a promptfoo Python assertion. The
assertion disables internet access for the sandbox, imposes a five-second
execution timeout, compares stdout to the expected result, and records metrics
in `.promptfoo_results/`.

The lightweight static scan in `validate_and_run_code_e2b.py` is an additional
example guard, not a complete security boundary. Configure E2B templates and
network policies appropriate for your production workload.

## Setup

```bash
npx promptfoo@latest init --example integration-e2b
cd integration-e2b

python3 -m venv .venv
source .venv/bin/activate
pip install 'e2b-code-interpreter==2.6.2'

export E2B_API_KEY="e2b_your_key"
export OPENAI_API_KEY="sk_your_key"
export PROMPTFOO_PYTHON="$PWD/.venv/bin/python"
```

If you select another provider in `promptfooconfig.yaml`, set that provider's
credentials instead of `OPENAI_API_KEY`.

## Run

Run a fresh evaluation and export the results:

```bash
npx promptfoo eval --no-cache -o output.json
```

Inspect `output.json` for pass/fail results, scores, and errors. You can also
open the local viewer:

```bash
npx promptfoo view
```

To produce a Markdown summary from collected metric files:

```bash
python report.py
```
