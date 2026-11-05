# agentest-checklist (Agentest Checklist)

Community example that loads an open checklist of 110 tests for tool-using agents into promptfoo. The checklist spans 4 pillars (evals, security, privacy, and responsible behaviour) and includes examples and labelled traces. The open-source [agentest](https://github.com/srpadmanabhuni/agentest) runner checks those tests against traces.

Promptfoo is not an agentest dependency. Install and run it on its own.

You can run this example with:

```bash
npx promptfoo@latest init --example agentest-checklist
cd agentest-checklist
```

## Dataset

Examples come from the Hugging Face dataset [`srinivaspadmanabhuni/agentic-ai-test-checklist-110`](https://huggingface.co/datasets/srinivaspadmanabhuni/agentic-ai-test-checklist-110) (CC BY 4.0). This folder loads the examples CSV. The same dataset also publishes labelled traces.

Contact: srinivas AT testAIng.com

## Full eval

`promptfoo_tests_from_hf.py` uses only the Python standard library. It writes `tests.json` with `llm-rubric` assertions. Pass a limit to keep the file small.

```bash
python promptfoo_tests_from_hf.py
python promptfoo_tests_from_hf.py 10
npx promptfoo@latest eval
```

`llm-rubric` needs a grader model and your own API key. The provider in `promptfooconfig.yaml` is `echo`, which is free and offline. Swap in your agent or provider before you read the scores as an evaluation of agent behavior.

`tests.json` is generated output and is gitignored.

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
