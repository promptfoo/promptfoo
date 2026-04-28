# integration-inspect-osworld (OSWorld via Inspect)

This example runs a real [OSWorld](https://github.com/xlang-ai/OSWorld) task through promptfoo by wrapping the Inspect-native implementation in [`inspect_evals/osworld`](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/osworld). OSWorld is a multimodal computer-use benchmark where an agent observes an Ubuntu desktop via screenshots, acts with mouse and keyboard tools, and is graded by task-specific checks against VM state. The benchmark is described in [OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments](https://arxiv.org/abs/2404.07972).

This is an orchestration wrapper, not a from-scratch promptfoo-native computer-use agent loop. Inspect owns the Docker sandbox, `basic_agent` solver, `computer` tool, screenshots, model calls, and OSWorld scorer. Promptfoo starts one Inspect eval, dumps the `.eval` log to JSON, parses the final score, and applies a normal promptfoo assertion.

## Prerequisites

You need:

- Docker Engine 24.0.6 or newer, running and usable by your current user.
- Docker Compose V2 available as `docker compose`. Inspect validates this with
  `docker compose version --format json`; a standalone `docker-compose` binary
  is not enough unless your `docker` command exposes it as `docker compose`.
- Python with Inspect's OSWorld dependencies, Promptfoo's Python OpenTelemetry
  dependencies, and the SDK for whichever model provider you choose. This
  installs both SDKs used below:

  ```bash
  pip install 'inspect-evals[osworld]' openai anthropic opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
  ```

- A computer-use-capable model and API key. For the default config, export
  `OPENAI_API_KEY`. To use Anthropic instead, export `ANTHROPIC_API_KEY` and set
  `vars.model` or `providers[0].config.defaultModel` to an Inspect model such as
  `anthropic/claude-sonnet-4-5`.
- Disk and time for Inspect's OSWorld Docker image. The first run builds an image of roughly 8GB and can take several minutes before the sample starts.
- Budget for a non-trivial model run. A single OSWorld sample commonly takes 5-15 minutes and can use many tokens.

This proof of concept uses `inspect_evals/osworld_small`, the smaller OSWorld corpus supported by Inspect.

## Run

From the repository root:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  npm run local -- eval -c examples/integration-inspect-osworld/promptfooconfig.yaml --no-cache
```

Or, after copying the example with `npx promptfoo@latest init --example integration-inspect-osworld`, run:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache
```

The test list lives in CSV. `promptfooconfig.yaml` keeps the shared assertion
and tracing metadata in `defaultTest`, then loads one row per OSWorld run:

```yaml
defaultTest:
  metadata:
    tracingEnabled: true
  assert:
    - type: python
      value: file://assertion.py

tests: file://osworld-tests.csv
```

```csv
__description,prompt,app,sample_id,__metadata:testCaseId
libreoffice_calc - first supported sample with tracing,Run the pinned LibreOffice Calc OSWorld sample,libreoffice_calc,42e0a640-4f19-4b28-973d-729602b5a4a7,osworld-libreoffice-calc-gpt55
```

To add another expensive OSWorld sample, append a row to `osworld-tests.csv`.
Promptfoo maps normal CSV columns into `vars`, so `app`, `sample_id`,
`task_index`, and optional per-row `model` values are available to
`provider.py`. `__description` and `__metadata:testCaseId` set Promptfoo result
fields.

To run an exact OSWorld sample, set `sample_id` in the CSV row. This is the
most reliable selector for larger comparisons because it maps directly to
Inspect's `--sample-id` flag:

```csv
prompt,app,sample_id
Run the pinned LibreOffice Calc OSWorld sample,libreoffice_calc,42e0a640-4f19-4b28-973d-729602b5a4a7
```

To run the Nth task within an app subset, add zero-based `task_index` instead
of `sample_id`. The provider maps `task_index: 2` to Inspect `--limit 3-3`.

```csv
prompt,app,task_index
Run the third LibreOffice Calc OSWorld sample,libreoffice_calc,2
```

Inspect filters by OSWorld app ids, and multi-app tasks use `multi_apps`.
For example, VS Code is `vscode`, not `vs_code`.

The example config sets two timeouts because both layers need enough time:

- `providers[0].config.timeout` is promptfoo's Python worker timeout in
  milliseconds.
- `providers[0].config.timeoutSeconds` is the inner Inspect subprocess timeout
  in seconds.

## Expected output

The provider returns text like:

```text
Sample <id> on app libreoffice_calc: score=1.0 status=pass

Final answer: <agent final message if Inspect logged one>
```

It also returns metadata for the promptfoo UI and assertions:

```json
{
  "inspect_log_path": "/absolute/path/to/examples/integration-inspect-osworld/inspect_logs/.../*.eval",
  "score": 1.0,
  "status": "pass",
  "sample_id": "...",
  "model": "openai/gpt-5.5",
  "num_messages": 42,
  "duration_seconds": 600.0
}
```

The Python assertion passes when `metadata.score >= 1.0` or `metadata.status == "pass"`.

## Reference GPT-5.5 run

A local traced run of all 21 `osworld_small` samples with exact `sample_id`
selectors and `--max-concurrency 6` completed in 20m 9s. GPT-5.5 passed 13
samples and produced 7 scored failures. One concurrent run hit an Inspect
computer-tool runtime error before scoring; rerunning that exact `sample_id`
alone with `--max-concurrency 1` completed normally with score `0.0`. After that
rerun, the report had 13 passes, 8 scored failures, 0 provider errors, and mean
OSWorld score `0.665`. Promptfoo recorded 21 trace records and 21 wrapper-level
Python provider spans for the concurrent run.

For larger benchmark reports, rerun provider-error samples by exact `sample_id`
before publishing a pass rate. Count reruns that produce an OSWorld score as
normal passes or failures, and keep repeated provider errors separate from
scored benchmark failures.

## Inspect logs and traces

Inspect writes `.eval` files under `examples/integration-inspect-osworld/inspect_logs/`. They are ignored by git because they can include screenshots, trajectories, tool calls, model outputs, and other large run artifacts.

For trace-level visibility into the OSWorld desktop trajectory, use Inspect's
viewer:

```bash
inspect view --log-dir examples/integration-inspect-osworld/inspect_logs
```

The example config enables Promptfoo OpenTelemetry tracing. Set
`PROMPTFOO_ENABLE_OTEL=true` for Python provider spans. This records the
wrapper-level Python provider call and links it to the eval result, but it does
not translate Inspect's internal screenshots, mouse moves, keyboard actions, or
scorer events into Promptfoo trajectory spans. Inspect's `.eval` log remains the
source of truth for those steps.

## Smoke test without model spend

To check the Inspect CLI shape without running a full OSWorld sample:

```bash
inspect eval inspect_evals/osworld_small --model mockllm/model --limit 0 -T include_apps=libreoffice_calc --log-dir <dir>
inspect log dump <file.eval>
```

A real end-to-end OSWorld run still requires Docker, the first-run image build,
provider credentials, and 5-15 minutes of runtime.
