# redteam-agents-sdk (OpenAI agentic runtime Red Team)

This example demonstrates the `agentic:*` red-team plugins against a local OpenAI agentic runtime fixture with Promptfoo OTEL tracing enabled.

The fixture imports the agentic runtime, runs a small SDK-backed probe, and emits structured finding spans to Promptfoo's OTLP receiver. The vulnerable target intentionally emits one OTEL finding for each plugin; the hardened target exercises the same SDK probe and emits no findings. That lets you verify both detection and non-finding behavior without network calls.

## Run

```bash
npx promptfoo@latest init --example redteam-agents-sdk
```

Set `AGENTS_SDK_REPO` to a local checkout of `openai-agents-python` and point `PROMPTFOO_PYTHON` at an environment that can import that checkout:

```bash
export AGENTS_SDK_REPO=/path/to/openai-agents-python
export PROMPTFOO_PYTHON=$AGENTS_SDK_REPO/.venv/bin/python
export PROMPTFOO_CONFIG_DIR=/tmp/agents-sdk-redteam-promptfoo-config
mkdir -p "$PROMPTFOO_CONFIG_DIR"
npm run local -- eval -c examples/redteam-agents-sdk/promptfooconfig.yaml --no-cache --no-share
```

Using a temporary `PROMPTFOO_CONFIG_DIR` keeps this proof independent of any
logged-in Promptfoo Cloud account on the workstation, which avoids network
feature-detection delays during offline local QA.

Expected behavior:

- `agents-sdk-vulnerable-fixture` fails all eight `agentic:*` assertions.
- `agents-sdk-hardened-fixture` passes all eight assertions.
- Grader metadata reports `evidenceSource: otel` for the assertions because the proof comes from trace spans, not from final text.

To verify local plugin generation, run:

```bash
mkdir -p /tmp/agents-sdk-redteam-generated-run
mkdir -p /tmp/agents-sdk-redteam-generated-run/promptfoo-config
cp examples/redteam-agents-sdk/agent_sdk_provider.py /tmp/agents-sdk-redteam-generated-run/
PROMPTFOO_CONFIG_DIR=/tmp/agents-sdk-redteam-generated-run/promptfoo-config \
  npm run local -- redteam generate \
  -c examples/redteam-agents-sdk/promptfooconfig.yaml \
  -o /tmp/agents-sdk-redteam-generated-run/promptfooconfig.yaml
PROMPTFOO_CONFIG_DIR=/tmp/agents-sdk-redteam-generated-run/promptfoo-config \
  npm run local -- eval \
  -c /tmp/agents-sdk-redteam-generated-run/promptfooconfig.yaml \
  --no-cache --no-share
```

Generated configs resolve `file://` providers relative to the generated config path. Keeping `agent_sdk_provider.py` beside the generated config makes that evaluation portable. The generated config should contain one deterministic test for each `agentic:*` plugin.

## Real Examples With Meta and Hydra

`real-examples-strategies.promptfooconfig.yaml` runs the same eight plugins against real Agents SDK examples and then applies `jailbreak:meta` and `jailbreak:hydra` through a local remote-generation stub. The plugin counts are pinned to `numTests: 1` so CI and local QA get one deterministic base case per plugin, then one meta and one hydra variant of each case.

```bash
python3 examples/redteam-agents-sdk/local_strategy_task_server.py --port 19737
```

Then run the generated config from a directory that also contains the file provider and its helper:

```bash
mkdir -p /tmp/agents-sdk-real-examples-run
mkdir -p /tmp/agents-sdk-real-examples-run/promptfoo-config
cp examples/redteam-agents-sdk/real_examples_provider.py \
  examples/redteam-agents-sdk/agent_sdk_provider.py \
  /tmp/agents-sdk-real-examples-run/

env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
  PROMPTFOO_CONFIG_DIR=/tmp/agents-sdk-real-examples-run/promptfoo-config \
  PROMPTFOO_REMOTE_GENERATION_URL=http://127.0.0.1:19737 \
  AGENTS_SDK_REPO=$AGENTS_SDK_REPO \
  npm run local -- redteam generate \
  -c examples/redteam-agents-sdk/real-examples-strategies.promptfooconfig.yaml \
  --remote --no-cache --force \
  -o /tmp/agents-sdk-real-examples-run/promptfooconfig.yaml

env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
  PROMPTFOO_CONFIG_DIR=/tmp/agents-sdk-real-examples-run/promptfoo-config \
  PROMPTFOO_REMOTE_GENERATION_URL=http://127.0.0.1:19737 \
  PROMPTFOO_PYTHON=$AGENTS_SDK_REPO/.venv/bin/python \
  AGENTS_SDK_REPO=$AGENTS_SDK_REPO \
  npm run local -- eval \
  -c /tmp/agents-sdk-real-examples-run/promptfooconfig.yaml \
  --remote --no-cache --no-share
```

Expected behavior: 24 findings, no runtime errors, and every plugin has one base case, one `jailbreak:meta` case, and one `jailbreak:hydra` case with `evidenceSource: otel` in grader metadata.

`real-examples-negative-strategies.promptfooconfig.yaml` runs the same generated base/meta/hydra shape with the real-examples provider in `mode: benign`. Expected behavior is the inverse: 24 passes, no runtime errors, and each assertion reports `verifierStatus: passed`. The guardrail negative control uses the customer-service FAQ path so the trace contains benign real SDK activity without an `update_seat` side effect.

## Real agentic runtime Sample App Proof

This directory also includes a Promptfoo target for the real agentic runtime customer-service sample app at `examples/customer_service/main.py`. It verifies that `agentic:guardrail-coverage-gap` finds a concrete sample-app issue when the sample executes `update_seat` without an approval or guardrail on that side-effect path, while a FAQ-only request remains clean.

```bash
mkdir -p /tmp/agents-sdk-customer-service-sample/promptfoo-config
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
  PROMPTFOO_CONFIG_DIR=/tmp/agents-sdk-customer-service-sample/promptfoo-config \
  PROMPTFOO_PYTHON=$AGENTS_SDK_REPO/.venv/bin/python \
  AGENTS_SDK_REPO=$AGENTS_SDK_REPO \
  npm run local -- eval \
  -c examples/redteam-agents-sdk/customer-service-sample.promptfooconfig.yaml \
  --no-cache --no-share
```

Expected behavior:

- The seat-update test fails with an `AgenticGuardrailCoverageGap` finding and records an `update_seat` tool call from the sample app.
- The FAQ negative-control test passes and records only the `faq_lookup_tool` path.
