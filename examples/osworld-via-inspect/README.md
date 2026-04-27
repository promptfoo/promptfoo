# osworld-via-inspect (OSWorld via Inspect)

This example runs a real [OSWorld](https://github.com/xlang-ai/OSWorld) task through promptfoo by wrapping the Inspect-native implementation in [`inspect_evals/osworld`](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/osworld). OSWorld is a multimodal computer-use benchmark where an agent observes an Ubuntu desktop via screenshots, acts with mouse and keyboard tools, and is graded by task-specific checks against VM state. The benchmark is described in [OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments](https://arxiv.org/abs/2404.07972).

This is an orchestration wrapper, not a from-scratch promptfoo-native computer-use agent loop. Inspect owns the Docker sandbox, `basic_agent` solver, `computer` tool, screenshots, model calls, and OSWorld scorer. Promptfoo starts one Inspect eval, dumps the `.eval` log to JSON, parses the final score, and applies a normal promptfoo assertion.

## Prerequisites

You need:

- Docker Engine 24.0.6 or newer, running and usable by your current user.
- Docker Compose V2 available as `docker compose`. Inspect validates this with
  `docker compose version --format json`; a standalone `docker-compose` binary
  is not enough unless your `docker` command exposes it as `docker compose`.
- Python with Inspect's OSWorld dependencies and the SDK for whichever model
  provider you choose. This installs both SDKs used below:

  ```bash
  pip install 'inspect-evals[osworld]' openai anthropic
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
npm run local -- eval -c examples/osworld-via-inspect/promptfooconfig.yaml --no-cache
```

Or, after copying the example with `npx promptfoo@latest init --example osworld-via-inspect`, run:

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache
```

The active test runs the first supported `libreoffice_calc` sample. To select a different Inspect model for one test, add `model` under `vars`:

```yaml
vars:
  app: libreoffice_calc
  model: openai/gpt-5-nano
```

To run the Nth task within an app subset, add zero-based `task_index`. The provider maps `task_index: 2` to Inspect `--limit 3-3`.

Inspect filters by OSWorld `related_apps` ids. For example, VS Code is
`vscode`, not `vs_code`.

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
  "inspect_log_path": "/absolute/path/to/examples/osworld-via-inspect/inspect_logs/.../*.eval",
  "score": 1.0,
  "status": "pass",
  "sample_id": "...",
  "model": "openai/gpt-5.5",
  "num_messages": 42,
  "duration_seconds": 600.0
}
```

The Python assertion passes when `metadata.score >= 1.0` or `metadata.status == "pass"`.

## Inspect logs and traces

Inspect writes `.eval` files under `examples/osworld-via-inspect/inspect_logs/`. They are ignored by git because they can include screenshots, trajectories, tool calls, model outputs, and other large run artifacts.

For trace-level visibility, use Inspect's viewer instead of promptfoo OTLP tracing:

```bash
inspect view --log-dir examples/osworld-via-inspect/inspect_logs
```

Bridging Inspect's internal spans into promptfoo traces would require non-trivial trace translation, so this example keeps the integration at the orchestration and scoring layer.

## Smoke test without model spend

To check the Inspect CLI shape without running a full OSWorld sample:

```bash
inspect eval inspect_evals/osworld_small --model mockllm/model --limit 0 -T include_apps=libreoffice_calc --log-dir <dir>
inspect log dump <file.eval>
```

A real end-to-end OSWorld run still requires Docker, the first-run image build,
provider credentials, and 5-15 minutes of runtime.
