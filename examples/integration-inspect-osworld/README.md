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
- Budget for a non-trivial model run. Start with one exact sample before expanding
  to a larger subset or the full suite.

The default config uses `inspect_evals/osworld_small`, the smaller OSWorld corpus
supported by Inspect. `promptfooconfig.full.yaml` switches to
`inspect_evals/osworld` with `include_connected=true`, which loads every
Inspect-supported full-corpus sample. In the Inspect version used for this
example, that is 246 samples, not the 369-task upstream OSWorld paper corpus.

## Run

For the first real verification from the repository root, run one exact sample:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  npm run local -- eval -c examples/integration-inspect-osworld/promptfooconfig.yaml --no-cache \
    --filter-metadata sample_id=42e0a640-4f19-4b28-973d-729602b5a4a7
```

Or, after copying the example with `npx promptfoo@latest init --example integration-inspect-osworld`, run:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache \
    --filter-metadata sample_id=42e0a640-4f19-4b28-973d-729602b5a4a7
```

After that succeeds, broaden to an app subset:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache \
    --filter-metadata app=libreoffice_calc --max-concurrency 1 \
    -o osworld-libreoffice-calc.json
```

App filters are still multi-sample runs. In the current `osworld_small` set,
`app=libreoffice_calc` selects three samples; in one local GPT-5.5 verification
on April 29, 2026, that sequential subset took 12m31s and used 533,101 total
tokens. Treat that as scale guidance, not a fixed benchmark.

To run the full supported small suite, remove the metadata filter and set a
concurrency appropriate for your machine:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache --max-concurrency 6 \
    -o osworld-results.json
```

To run Inspect's full supported corpus through Promptfoo, use the dedicated
full-suite config:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.full.yaml --no-cache --max-concurrency 3 \
    -o osworld-full-results.json
```

That config keeps the same wrapper but switches both moving pieces that define
the run:

```yaml
providers:
  - id: file://provider.py
    config:
      task: inspect_evals/osworld
      taskParameters:
        include_connected: true

tests: file://osworld_tests.py:generate_full_tests
```

Because the full config includes connected samples, it is more sensitive to the
runtime network environment than the default small-suite config.

The full config also uses larger timeouts than the small config:

- `timeout: 7500000` gives Promptfoo's Python worker a little over two hours.
- `timeoutSeconds: 7200` gives the inner Inspect subprocess two hours.

Some full-suite Writer rows can exceed the small config's 30-minute timeout
budget, so keep the full-suite timeouts larger than the exact-sample and
small-suite defaults.

`promptfooconfig.yaml` keeps the shared assertion and tracing metadata in
`defaultTest`, then asks `osworld_tests.py` to generate the OSWorld rows:

```yaml
defaultTest:
  metadata:
    tracingEnabled: true
  assert:
    - type: python
      value: file://assertion.py

tests: file://osworld_tests.py:generate_tests
```

The loader calls Inspect's `osworld_small().dataset` or
`osworld(include_connected=True).dataset` and returns one Promptfoo test case per
supported sample. Each row sets `vars.prompt`, `vars.app`, `vars.sample_id`, and
matching filterable metadata. Because Inspect supplies the sample ids, updating
`inspect-evals` updates the generated row list without maintaining a local copy.

The default config runs the full Inspect-supported `osworld_small` suite, which
is 21 samples in the version used for the reference run below. To run a broader
subset after the exact-sample check, filter by app metadata:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache --filter-metadata app=libreoffice_calc
```

To run the smallest real end-to-end validation, filter by `sample_id`:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  promptfoo eval -c promptfooconfig.yaml --no-cache \
    --filter-metadata sample_id=42e0a640-4f19-4b28-973d-729602b5a4a7
```

For custom subsets, filter by metadata at the CLI. The generated metadata uses
OSWorld app ids, normalizes VS Code to `vscode`, and keeps multi-app tasks under
`multi_apps`.

Use the run scopes intentionally:

1. `mockllm/model --limit 0` checks the Inspect CLI shape without model spend.
2. `--filter-metadata sample_id=...` is the smallest real end-to-end validation.
3. `--filter-metadata app=...` is a broader app slice and may include multiple samples.
4. No filter on `promptfooconfig.yaml` runs the full small suite.
5. `promptfooconfig.full.yaml` runs Inspect's full supported corpus and is the benchmark-style configuration.

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

If Inspect exits before a scored sample is available, or if the selected sample
has no OSWorld scorer result, the provider returns an error instead of converting
that condition into a benchmark failure. For subprocess failures, Promptfoo stores
only a concise error plus the local log path/status/duration; inspect the local
Inspect logs when you need the detailed trajectory or raw tool output.

## Reference GPT-5.5 run

A local traced run of the generated 21-sample suite with exact `sample_id`
selectors and `--max-concurrency 6` completed in 20m 9s. GPT-5.5 passed 13
samples and produced 7 scored failures. One concurrent run hit an Inspect
computer-tool runtime error before scoring; rerunning that exact `sample_id`
alone with `--max-concurrency 1` completed normally with score `0.0`. After
that rerun, the report had 13 passes, 8 scored failures, 0 provider errors, and
mean OSWorld score `0.665`. Promptfoo recorded 21 trace records and 21
Python provider spans for the concurrent run.

For larger benchmark reports, rerun provider-error samples by exact `sample_id`
before publishing a pass rate. Count reruns that produce an OSWorld score as
normal passes or failures, and keep repeated provider errors separate from
scored benchmark failures.

For the full supported corpus, a local GPT-5.5 run on April 30, 2026 used
`promptfooconfig.full.yaml`, `--max-concurrency 3`, and a 6-vCPU / 16-GiB
Colima VM. The 246-sample run took 5h27m5s and used 54,421,072 total tokens.
The raw run ended at 138 passes, 101 scored failures, and 7 provider errors.
Rerunning those seven rows one at a time recovered one pass and two ordinary
scored failures; four rows repeated as provider errors. The reconciled report
was therefore 139 passes, 103 scored failures, 4 provider errors, and mean
OSWorld score `0.594` across the 242 scored rows. The seven targeted reruns
added 1,917,890 tokens.

The repeated provider errors were not model failures: one row reproduced an
Inspect computer-tool runtime error, one row reproduced an OSWorld scorer
missing-image-artifact error, and two VLC rows reproduced an OSWorld scorer
environment error. Keep those rows outside the scored denominator unless a
later rerun produces an OSWorld score.

## Inspect logs and traces

Inspect writes `.eval` files under `examples/integration-inspect-osworld/inspect_logs/`. They are ignored by git because they can include screenshots, trajectories, tool calls, model outputs, and other large run artifacts.

For trace-level visibility into the OSWorld desktop trajectory, use Inspect's
viewer:

```bash
inspect view --log-dir examples/integration-inspect-osworld/inspect_logs
```

The example config enables Promptfoo OpenTelemetry tracing. Set
`PROMPTFOO_ENABLE_OTEL=true` for Python provider spans. This records the
Python provider call and links it to the eval result, but it does not translate
Inspect's internal screenshots, mouse moves, keyboard actions, or scorer events
into Promptfoo trajectory spans. Use Inspect's `.eval` log for those steps.

## Smoke test without model spend

To check the Inspect CLI shape without running a full OSWorld sample:

```bash
inspect eval inspect_evals/osworld_small --model mockllm/model --limit 0 --log-dir <dir>
inspect log dump <file.eval>
```

A real end-to-end OSWorld run still requires Docker, the first-run image build,
and provider credentials. Use one exact sample before spending on larger slices.
