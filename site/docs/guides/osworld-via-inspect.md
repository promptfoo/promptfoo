---
title: Evaluate OSWorld with Inspect
description: Run OSWorld computer-use benchmark tasks in Promptfoo with Inspect, Docker desktop sandboxes, screenshots, scorer output, eval logs, and tracing limitations.
sidebar_position: 66
---

# Evaluate OSWorld with Inspect

OSWorld is a [computer-use benchmark](https://arxiv.org/abs/2404.07972) for agents that operate a real desktop. A task may ask the model to edit a spreadsheet, use a browser, modify a document, or configure an app. The agent receives screenshots, uses mouse and keyboard tools, and is graded against the final VM state.

The `osworld-via-inspect` example runs OSWorld through [Inspect](https://inspect.aisi.org.uk/) and reports the score back to Promptfoo. This is useful when you want Promptfoo's config, assertions, result table, and CI workflow around a benchmark that already has a mature desktop harness.

![OSWorld LibreOffice Calc task](/img/docs/osworld-via-inspect/osworld-libreoffice-start.png)

## What runs

The example uses Inspect's `inspect_evals/osworld_small` task, a smaller OSWorld corpus packaged for Inspect. The active promptfoo test filters that corpus to `libreoffice_calc` and runs the first matching sample.

In the sample shown above, OSWorld opens `NetIncome.xlsx` in LibreOffice Calc and asks the agent to compute totals for the `Revenue` and `Total Expenses` columns on a new sheet. Inspect provides the Ubuntu desktop sandbox, screenshots, computer tool, model loop, and scorer.

Promptfoo does not send the prompt text to the model as the OSWorld instruction. The OSWorld dataset supplies the task instruction. The Promptfoo prompt is only a wrapper label:

```yaml
prompts:
  - 'Run OSWorld sample on app {{app}}'
```

## How the wrapper works

The example is intentionally thin:

1. Promptfoo calls `provider.py` once for each test case.
2. The provider starts `inspect eval inspect_evals/osworld_small`.
3. Inspect runs the desktop sandbox and agent loop.
4. Inspect writes a `.eval` log with screenshots, model messages, tool calls, files, scores, and metadata.
5. The provider runs `inspect log dump`, parses the sample score, and returns normal Promptfoo output and metadata.
6. `assertion.py` passes only when the OSWorld sample score is `1.0`.

This means Promptfoo owns orchestration and reporting. Inspect owns the agent runtime and OSWorld grading.

![Inspect OSWorld trajectory screenshot](/img/docs/osworld-via-inspect/osworld-inspect-trajectory.png)

## Prerequisites

You need Docker because OSWorld runs a desktop environment:

- Docker Engine 24.0.6 or newer
- Docker Compose V2 available as `docker compose`
- Python with Inspect OSWorld dependencies
- The SDK and API key for the model provider you choose

Install the Python dependencies:

```bash
pip install 'inspect-evals[osworld]' anthropic openai
```

For the default config, export `ANTHROPIC_API_KEY`. To use an OpenAI model, export `OPENAI_API_KEY` and override the model in the test vars or on the command line.

The first run can build an OSWorld Docker image of roughly 8GB. A single sample commonly takes 5-15 minutes and can use many tokens.

## Run the example

Create the example:

```bash
npx promptfoo@latest init --example osworld-via-inspect
cd osworld-via-inspect
```

Run the active LibreOffice Calc sample:

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache
```

To run it from the promptfoo repository source tree:

```bash
npm run local -- eval -c examples/osworld-via-inspect/promptfooconfig.yaml --no-cache
```

To test a different Inspect model for one run:

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache --var model=openai/gpt-5-nano
```

## Configuration

The provider config sets two timeouts because there are two execution layers:

```yaml title="promptfooconfig.yaml"
providers:
  - id: file://provider.py
    label: OSWorld (inspect wrapper)
    config:
      defaultModel: anthropic/claude-sonnet-4-5
      timeout: 1800000 # Promptfoo Python worker timeout, in ms
      timeoutSeconds: 1800 # Inspect subprocess timeout, in seconds
```

Tests select OSWorld app subsets with `vars.app`:

```yaml
tests:
  - description: libreoffice_calc - first supported sample
    vars:
      app: libreoffice_calc
    assert:
      - type: python
        value: file://assertion.py
```

Inspect filters by OSWorld `related_apps` ids. For example, VS Code samples use `vscode`, not `vs_code`.

To run a later sample from the selected app subset, add zero-based `task_index`:

```yaml
vars:
  app: libreoffice_calc
  task_index: 2
```

The provider maps `task_index: 2` to Inspect `--limit 3-3`.

## Read the results

The provider returns the OSWorld sample id, score, status, final assistant text, token usage, and path to the Inspect log:

```json
{
  "inspect_log_path": "/absolute/path/to/inspect_logs/.../*.eval",
  "score": 0.0,
  "status": "fail",
  "sample_id": "42e0a640-4f19-4b28-973d-729602b5a4a7",
  "model": "openai/gpt-5-nano",
  "num_messages": 58,
  "duration_seconds": 617.32,
  "task": "inspect_evals/osworld_small",
  "app": "libreoffice_calc"
}
```

A failed score is still a valid eval result when Inspect completed and the OSWorld scorer returned `0.0`. Treat provider errors differently: those indicate setup, Docker, model SDK, timeout, or log parsing failures before a scored sample was produced.

## Inspect logs

Inspect logs are the source of truth for trajectory debugging:

```bash
inspect view --log-dir inspect_logs
```

The viewer shows screenshots, intermediate model messages, tool calls, files, scorer output, and token usage. The `.eval` files can contain sensitive screenshots and model outputs, so keep them out of git and avoid sharing them publicly.

## Tracing

This example does not enable Promptfoo OpenTelemetry tracing. The config has no `tracing:` block, and the wrapper does not translate Inspect's internal trajectory into Promptfoo trace spans.

Trace-level visibility still exists in Inspect: every run writes a `.eval` log, and `inspect view` displays the desktop trajectory. Promptfoo receives only the wrapper-level result: output text, score, token usage, sample id, status, and `inspect_log_path`.

To make this Promptfoo-native tracing, the wrapper would need to translate Inspect events into OpenTelemetry spans or expose a Promptfoo trace object. Without that bridge, Promptfoo trace assertions such as `trajectory:tool-used` cannot see the OSWorld mouse, keyboard, or screenshot steps.

## When to use this pattern

Use this wrapper when you want to:

- Run a real OSWorld desktop task from promptfoo.
- Compare models on a small number of expensive computer-use samples.
- Store benchmark scores beside other Promptfoo evals.
- Use Inspect's viewer for detailed trajectory review.
- Add Promptfoo assertions or CI gates around Inspect's scorer output.

Avoid treating this as a cheap smoke test. OSWorld samples are slow, stateful, and token-heavy. Start with one app and one `task_index`, inspect the `.eval` log, then expand the sample set once the model and environment are stable.
