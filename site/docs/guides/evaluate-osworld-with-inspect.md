---
title: Evaluate OSWorld with Inspect
description: Run OSWorld computer-use benchmark evals in Promptfoo with Inspect, GPT-5.5, Docker-backed desktop sandboxes, scorer output, eval logs, and local traces.
sidebar_position: 66
---

# Evaluate OSWorld with Inspect

OSWorld is a [computer-use benchmark](https://arxiv.org/abs/2404.07972) for agents that operate a real desktop. A task may ask the model to edit a spreadsheet, use a browser, modify a document, or configure an app. The agent receives screenshots, uses mouse and keyboard tools, and is graded against the final VM state.

The `integration-inspect-osworld` example runs an OSWorld eval through [Inspect](https://inspect.aisi.org.uk/) and reports the score back to Promptfoo. Use this pattern when the benchmark already has a mature desktop harness and you want Promptfoo to own the config, assertions, result table, traces, and CI gate around it.

![OSWorld LibreOffice Calc task](/img/docs/evaluate-osworld-with-inspect/osworld-libreoffice-start.png)

## What runs

The example uses Inspect's `inspect_evals/osworld_small` task, a smaller OSWorld corpus packaged for Inspect. The active promptfoo test runs a pinned `libreoffice_calc` sample by OSWorld sample id.

In the sample shown above, OSWorld opens `NetIncome.xlsx` in LibreOffice Calc and asks the agent to compute totals for the `Revenue` and `Total Expenses` columns on a new sheet. Inspect provides the Ubuntu desktop sandbox, screenshots, computer tool, model loop, and scorer.

Use a simple pass-through prompt such as `{{prompt}}` for Promptfoo's row label; Inspect reads the actual task instruction from the OSWorld dataset.

## How the wrapper works

The example is intentionally thin:

1. Promptfoo calls `provider.py` once for each test case.
2. The provider starts `inspect eval inspect_evals/osworld_small` with either `--sample-id <id>` or an app filter plus `--limit`.
3. Inspect runs the desktop sandbox and agent loop.
4. Inspect writes a `.eval` log with screenshots, model messages, tool calls, files, scores, and metadata.
5. The provider runs `inspect log dump`, parses the sample score, and returns normal Promptfoo output and metadata.
6. `assertion.py` passes only when the OSWorld sample score is `1.0`.

This means Promptfoo owns orchestration and reporting. Inspect owns the agent runtime and OSWorld grading.

For the pinned LibreOffice Calc row, the provider effectively runs:

```bash
inspect eval inspect_evals/osworld_small \
  --model openai/gpt-5.5 \
  --sample-id 42e0a640-4f19-4b28-973d-729602b5a4a7 \
  --log-dir /absolute/path/to/inspect_logs/<run>

inspect log dump /absolute/path/to/inspect_logs/<run>/<file>.eval
```

![Inspect OSWorld trajectory screenshot](/img/docs/evaluate-osworld-with-inspect/osworld-inspect-trajectory.png)

## Implementation map

The example has four moving parts:

- `promptfooconfig.yaml` is the Promptfoo entrypoint. It selects GPT-5.5, sets both timeouts, enables tracing, and defines one OSWorld row.
- `provider.py` is a file provider with `call_api(prompt, options, context)`. It resolves paths to absolute locations, runs Inspect, dumps the `.eval` file to JSON, and returns Promptfoo output plus metadata.
- `assertion.py` reads `context.providerResponse.metadata.score` and turns the OSWorld scorer result into a normal Promptfoo pass or fail.
- `inspect_logs/` is gitignored run state. Inspect stores screenshots, model messages, tool calls, files, scorer output, and token usage there.

The provider treats three states differently:

- `score >= 1.0`: Inspect completed and OSWorld scored the task as correct.
- `score < 1.0`: Inspect completed and OSWorld scored the task as incorrect.
- provider `error`: setup, Docker, model SDK, timeout, tool execution, or log parsing failed before a scored sample was produced.

## Prerequisites

You need Docker because OSWorld runs a desktop environment:

- Docker Engine 24.0.6 or newer
- Docker Compose V2 available as `docker compose`
- Python with Inspect OSWorld and OpenTelemetry dependencies
- The SDK and API key for the model provider you choose

Install the Python dependencies:

```bash
pip install 'inspect-evals[osworld]' openai anthropic opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
```

For the default config, export `OPENAI_API_KEY`. To use Anthropic instead, export `ANTHROPIC_API_KEY` and override the model in the test vars or provider config.

The first run can build an OSWorld Docker image of roughly 8GB. A single sample commonly takes 5-15 minutes and can use many tokens.

## Run the example

Create the example:

```bash
npx promptfoo@latest init --example integration-inspect-osworld
cd integration-inspect-osworld
```

Run the traced LibreOffice Calc sample:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache -o osworld-results.json
```

To run it from the promptfoo repository source tree:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  npm run local -- eval -c examples/integration-inspect-osworld/promptfooconfig.yaml --no-cache \
    -o osworld-results.json
```

To make the GPT-5.5 model selection explicit for one run:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache --var model=openai/gpt-5.5
```

## Configuration

The provider config sets two timeouts because there are two execution layers:

```yaml
providers:
  - id: file://provider.py
    label: OSWorld via Inspect
    config:
      defaultModel: openai/gpt-5.5
      timeout: 1800000 # Promptfoo Python worker timeout, in ms
      timeoutSeconds: 1800 # Inspect subprocess timeout, in seconds
```

Tests select OSWorld app subsets with `vars.app`:

```yaml
tests:
  - description: libreoffice_calc - first supported sample
    vars:
      prompt: Run the pinned LibreOffice Calc OSWorld sample
      app: libreoffice_calc
      sample_id: 42e0a640-4f19-4b28-973d-729602b5a4a7
    metadata:
      testCaseId: osworld-libreoffice-calc-gpt55
      tracingEnabled: true
    assert:
      - type: python
        value: file://assertion.py
```

Inspect filters by OSWorld app ids. For example, VS Code samples use `vscode`,
not `vs_code`, and multi-app tasks use `multi_apps`.

For exact runs, prefer `sample_id`. The provider passes it to Inspect's
`--sample-id` flag and skips app/index filtering:

```yaml
vars:
  prompt: Run the pinned LibreOffice Calc OSWorld sample
  sample_id: 42e0a640-4f19-4b28-973d-729602b5a4a7
```

To run a later sample from the selected app subset, add zero-based `task_index`:

```yaml
vars:
  app: libreoffice_calc
  task_index: 2
```

The provider maps `task_index: 2` to Inspect `--limit 3-3`.

The example enables Promptfoo tracing directly:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      host: 127.0.0.1
      acceptFormats:
        - json
        - protobuf
```

The active test also sets `metadata.tracingEnabled: true` and a stable
`testCaseId` so the trace can be correlated with the result.

## Read the results

The provider returns the OSWorld sample id, score, status, final assistant text, token usage, and path to the Inspect log:

```json
{
  "inspect_log_path": "/absolute/path/to/inspect_logs/.../*.eval",
  "score": 0.0,
  "status": "fail",
  "sample_id": "42e0a640-4f19-4b28-973d-729602b5a4a7",
  "model": "openai/gpt-5.5",
  "num_messages": 58,
  "duration_seconds": 617.32,
  "task": "inspect_evals/osworld_small",
  "app": "libreoffice_calc"
}
```

A failed score is still a valid eval result when Inspect completed and the
OSWorld scorer returned `0.0`. Treat provider errors differently: those
indicate setup, Docker, model SDK, timeout, Inspect tool execution, or log
parsing failures before a scored sample was produced.

Inspect the exported Promptfoo JSON first:

```bash
jq '.results.results[] | {
  success,
  score,
  error,
  metadata: .response.metadata,
  tokenUsage: .response.tokenUsage
}' osworld-results.json
```

Then dump the underlying Inspect log for the row you care about:

```bash
inspect log dump "$(jq -r '.results.results[0].response.metadata.inspect_log_path' osworld-results.json)" \
  > inspect-log.json

jq '{
  status,
  sample_id: .samples[0].id,
  score: (.samples[0].scores | to_entries[0].value.value),
  final_answer: .samples[0].output.completion,
  model_usage: .stats.model_usage
}' inspect-log.json
```

For benchmark reporting, rerun provider-error samples by exact `sample_id` with
`--max-concurrency 1` before publishing a pass rate. If the rerun produces a
score, count it as a normal pass or fail. If it errors again, inspect the
`.eval` log and report it separately from scored OSWorld failures.

## Reference GPT-5.5 run

As a larger smoke test, we ran all 21 `osworld_small` samples with exact
`sample_id` selectors, GPT-5.5, Promptfoo tracing enabled, and
`--max-concurrency 6`. The concurrent run produced one unscored Inspect
computer-tool runtime error. Rerunning that exact sample alone produced a normal
score of `0.0`, so the final report below treats it as a scored failure rather
than an infrastructure error.

This is not a stable leaderboard number; it is a concrete example of the shape,
cost, and follow-up workflow for a real run on one local machine.

For a comparable run, generate a config with one test case per OSWorld
`sample_id`, keep the same provider and assertion blocks, and export the
results:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.full.yaml --no-cache --max-concurrency 6 \
    -o osworld-full-results.json
```

| Metric                          |                         Result |
| ------------------------------- | -----------------------------: |
| Eval id                         | `eval-7hQ-2026-04-28T02:52:18` |
| Error rerun eval id             | `eval-3rI-2026-04-28T03:30:43` |
| Samples                         |                             21 |
| Concurrency                     |                              6 |
| Wall time                       |                         20m 9s |
| Passed                          |                        13 / 21 |
| Scored failures after rerun     |                         8 / 21 |
| Provider errors after rerun     |                         0 / 21 |
| Mean OSWorld score              |                          0.665 |
| Promptfoo trace records         |                             21 |
| Promptfoo Python provider spans |                             21 |
| Total token counter after rerun |                      3,806,976 |

The strongest app clusters in that run were `gimp` and `libreoffice_calc`
at 100% pass rate. `vscode` passed 2 of 3. The hardest cases were mixed
desktop workflows, one OS administration task, the VLC conversion task, and one
near-miss LibreOffice Writer task that scored `0.9615` but did not meet the
strict `score >= 1.0` assertion.

| App                   | Samples | Passed | Scored failures | Mean score |
| --------------------- | ------: | -----: | --------------: | ---------: |
| `gimp`                |       2 |      2 |               0 |      1.000 |
| `libreoffice_calc`    |       3 |      3 |               0 |      1.000 |
| `libreoffice_impress` |       2 |      1 |               1 |      0.500 |
| `libreoffice_writer`  |       2 |      1 |               1 |      0.981 |
| `multi_apps`          |       6 |      3 |               3 |      0.500 |
| `os`                  |       2 |      1 |               1 |      0.500 |
| `vlc`                 |       1 |      0 |               1 |      0.000 |
| `vscode`              |       3 |      2 |               1 |      0.667 |

The rerun target was `multi_apps` sample
`eb303e01-261e-4972-8c07-c9b4e7a4922a`, a task that asks the agent to insert
speaker notes into a PowerPoint file. The original concurrent attempt errored
inside Inspect's `computer` tool while executing a model-requested desktop
command. The isolated rerun completed in 7m 44s, used 288,447 total tokens,
returned final answer `DONE`, and failed only because the OSWorld scorer
reported `compare_pptx_files(...) returned 0`.

## Inspect logs

Inspect logs are the source of truth for trajectory debugging:

```bash
inspect view --log-dir inspect_logs
```

The viewer shows screenshots, intermediate model messages, tool calls, files, scorer output, and token usage. The `.eval` files can contain sensitive screenshots and model outputs, so keep them out of git and avoid sharing them publicly.

## Tracing

The example config starts Promptfoo's local OTLP receiver and passes a W3C
`traceparent` into the Python provider. Set `PROMPTFOO_ENABLE_OTEL=true` so the
Python provider wrapper records a child span with the prompt, response, token
usage, status, eval id, and test case id.

Trace-level visibility into OSWorld itself still lives in Inspect: every run
writes a `.eval` log, and `inspect view` displays the desktop trajectory.
Promptfoo receives wrapper-level telemetry plus result metadata: output text,
score, token usage, sample id, status, and `inspect_log_path`.

You can verify that Promptfoo stored wrapper-level traces by checking the
result's trace in the Promptfoo UI, or by asserting on raw provider spans in a
separate trace-focused config. The real desktop trajectory remains in Inspect
unless you build a bridge from Inspect events to OpenTelemetry spans.

To make the desktop actions Promptfoo-native tracing, the wrapper would need to
translate Inspect events into OpenTelemetry spans or expose a Promptfoo trace
object. Without that bridge, Promptfoo trace assertions such as
`trajectory:tool-used` cannot see the OSWorld mouse, keyboard, or screenshot
steps.

## Reimplementation checklist

To reimplement the wrapper in another repo:

1. Create a Promptfoo file provider with `call_api(prompt, options, context)`.
2. Read `vars.sample_id` for exact runs, or `vars.app` plus optional zero-based `vars.task_index` for app subsets.
3. Resolve `basePath`, `logRoot`, and `--log-dir` to absolute paths before invoking Inspect.
4. Run `inspect eval inspect_evals/osworld_small --model <model> --sample-id <id> --log-dir <dir>` for exact samples.
5. Run `inspect log dump <file.eval>` and parse `samples[0].scores[*].value`, falling back to `results.scores[*].metrics.accuracy.value`.
6. Return Promptfoo `output`, `metadata.score`, `metadata.status`, `metadata.sample_id`, `metadata.inspect_log_path`, and `tokenUsage`.
7. Make assertion pass/fail depend on the OSWorld score, not the provider's final text.
8. Keep Inspect `.eval` logs out of git and inspect them when scores or provider errors look surprising.

## When to use this pattern

Use this wrapper when you want to:

- Run a real OSWorld desktop task from promptfoo.
- Compare models on a small number of expensive computer-use samples.
- Store benchmark scores beside other Promptfoo evals.
- Use Inspect's viewer for detailed trajectory review.
- Add Promptfoo assertions or CI gates around Inspect's scorer output.

Avoid treating this as a cheap smoke test. OSWorld samples are slow, stateful, and token-heavy. Start with one app and one `task_index`, inspect the `.eval` log, then expand the sample set once the model and environment are stable.
