# integration-hermeneutic (Local Wording Review)

Use [Hermeneutic](https://github.com/hermes-labs-ai/hermeneutic)'s fixed English
wording rules as a [Python assertion](https://www.promptfoo.dev/docs/configuration/expected-outputs/python/).
This example flags numeric completion claims and absolute wording for evidence
review. It uses the `echo` provider to check synthetic saved outputs, so the eval
requires no model, API key, or inference request.

## Run

```sh
npx promptfoo@latest init --example integration-hermeneutic
cd integration-hermeneutic
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export PROMPTFOO_PYTHON=$(command -v python)
npx promptfoo@latest eval --no-cache -o results.json
```

Python 3.10+ is required by the pinned Hermeneutic package. Install dependencies
before running offline. The commands above use a POSIX shell.

The supplied five cases deliberately produce **three passes and two assertion
failures**. The eval therefore exits nonzero at the default pass-rate threshold.
Inspect `results.json`: the numeric completion and absolute-wording cases should
fail with named rule IDs, not Python execution errors.

Run the adapter's offline checks separately:

```sh
python -m unittest discover -s . -p 'test_*.py'
```

## Use with your own outputs

Replace `echo` and the fixture prompt with your provider and prompts, retaining
the `python` assertion in `defaultTest`. `config.minSeverity` accepts `low`, `med`
(default), or `high`. Matches below the selected threshold remain visible in the
reason. Empty/non-text output fails; an invalid threshold is a configuration error.
The returned score is binary policy compliance, not a probability.

## What this check establishes

A failure means a fixed wording pattern matched at the selected severity. A true,
well-supported claim can still match. A pass means no blocking pattern matched;
it does not establish truth, task completion, safety, or instruction adherence.
The deliberately false geography fixture passes to demonstrate that limitation.
The partial-completion fixture demonstrates the package's contrast guard.

These synthetic cases verify integration behavior, not detection accuracy on
real model outputs. Use task-specific evidence checks or other assertions alongside
this wording signal. No transcript or output is sent to Hermeneutic's maintainers.
