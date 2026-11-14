# agentest-checklist (Agentest Checklist)

Community example that loads an open checklist of 110 tests for tool-using agents into promptfoo. The checklist spans 4 pillars (evals, security, privacy, and responsible behaviour) and includes examples and labelled traces. The open-source [agentest](https://github.com/srpadmanabhuni/agentest) runner checks those tests against traces.

Promptfoo is not an agentest dependency. Install and run it on its own.

You can run this example with:

```bash
npx promptfoo@latest init --example agentest-checklist
cd agentest-checklist
```

## Dataset

Examples come from the Hugging Face dataset [`srinivaspadmanabhuni/agentic-ai-test-checklist-110`](https://huggingface.co/datasets/srinivaspadmanabhuni/agentic-ai-test-checklist-110) (CC BY 4.0). The generator pins the v1.3.0 examples CSV to a dataset commit so reruns use the same source. The same dataset also publishes labelled traces.

Contact: srinivas AT testAIng.com

## Full eval

`promptfoo_tests_from_hf.py` uses only the Python standard library. A starter `tests.json` is committed (offline-safe `contains` asserts for the echo provider). Re-run the script with no limit to regenerate all 404 examples across the 110 checklist entries with `llm-rubric` assertions.

```bash
python promptfoo_tests_from_hf.py
export OPENAI_API_KEY=sk-...   # required for llm-rubric grading (or set your grader provider's key)
npx promptfoo@latest eval
```

`llm-rubric` needs a separate grading provider. With only the `echo` target configured, Promptfoo grades via OpenAI unless you pass another grader, so set `OPENAI_API_KEY` (or e.g. `npx promptfoo@latest eval --grader openai:gpt-4o-mini` with that key available). The provider in `promptfooconfig.yaml` is `echo`, which is free and offline for the target. Swap in your agent or provider before you read the scores as an evaluation of agent behavior.

### Optional: smaller generated suite

To regenerate a truncated suite for local experimentation (this overwrites `tests.json`), pass a positive integer limit. Do **not** run this as part of the full-eval sequence above, or the next `eval` will cover only that subset instead of all 110 cases:

```bash
python promptfoo_tests_from_hf.py 10
```

## Offline smoke

`promptfooconfig.smoke.yaml` uses `tests.smoke.json`, a committed sample of 3 cases. Each case uses a `contains` assertion so the echo provider can pass with no network and no grader:

```bash
npx promptfoo@latest eval --no-cache -c promptfooconfig.smoke.yaml
```

From a local promptfoo checkout:

```bash
npm run local -- eval -c examples/agentest-checklist/promptfooconfig.smoke.yaml --no-cache
```

## Links

- Dataset: https://huggingface.co/datasets/srinivaspadmanabhuni/agentic-ai-test-checklist-110
- agentest runner: https://github.com/srpadmanabhuni/agentest
- Citation: https://doi.org/10.5281/zenodo.23597877
