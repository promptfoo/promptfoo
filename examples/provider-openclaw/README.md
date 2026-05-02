# provider-openclaw (OpenClaw Agent Testing)

This example demonstrates how to use promptfoo with OpenClaw, a personal AI assistant gateway.

## Prerequisites

1. Install OpenClaw: `npm install -g openclaw@latest`
2. Run the onboarding wizard: `openclaw onboard`
3. Enable the OpenAI-compatible HTTP surface in `~/.openclaw/openclaw.json` if you want Chat,
   Responses, Embeddings, or model discovery. These HTTP endpoints are disabled by default upstream:
   ```json
   {
     "gateway": {
       "http": {
         "endpoints": {
           "chatCompletions": {
             "enabled": true
           },
           "responses": {
             "enabled": true
           }
         }
       }
     }
   }
   ```
4. Start the gateway: `openclaw gateway` (or restart if already running: `openclaw gateway restart`)

## Setup

```bash
npx promptfoo@latest init --example provider-openclaw
cd provider-openclaw
```

## Usage

```bash
npx promptfoo@latest eval
```

The provider auto-detects the gateway URL and bearer auth secret from the active OpenClaw config
(`OPENCLAW_CONFIG_PATH` when set, otherwise `~/.openclaw/openclaw.json`). This includes local
bind/port, `OPENCLAW_GATEWAY_PORT` local port overrides, `gateway.tls.enabled`, and
`gateway.mode=remote` with `gateway.remote.url`.

## Configuration

You can override auto-detection with explicit config:

```yaml
providers:
  - id: openclaw
    config:
      gateway_url: http://127.0.0.1:18789
      auth_token: your-token-here
      # Use auth_password instead when gateway.auth.mode=password
      # Optional backend model override, sent as x-openclaw-model:
      backend_model: openai/gpt-5.4
```

Or use environment variables:

```bash
export OPENCLAW_CONFIG_PATH=~/.openclaw/openclaw.json  # optional
export OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
# Or override only the local auto-detected port:
# export OPENCLAW_GATEWAY_PORT=18789
export OPENCLAW_GATEWAY_TOKEN=your-token-here
# Or, if your gateway uses password auth:
# export OPENCLAW_GATEWAY_PASSWORD=your-password-here
```

Bare `openclaw` targets OpenClaw's configured default agent through the stable upstream
`openclaw/default` alias. Use `openclaw:main` or `openclaw:<agent-id>` when you want an explicit
agent.

For `openclaw:agent:*`, promptfoo generates an isolated session key per call by default so evals do
not reuse your persistent OpenClaw session. Set `session_key` explicitly if you want continuity. The
WS provider signs OpenClaw's `connect.challenge`, persists issued device tokens, and retries once
with a cached device token when the gateway recommends it.

Use `openclaw:embedding` or `openclaw:embeddings:<agent-id>` as embedding providers for assertions
such as `similar`. Set `backend_model` when you want a specific embedding model such as
`openai/text-embedding-3-small`.

For password-mode gateways, use `auth_password` or `OPENCLAW_GATEWAY_PASSWORD`.

## What to test

- Use `openclaw` for baseline answer quality and default-agent routing.
- Hold the agent constant while varying `backend_model`, then hold the backend model constant while
  varying agents or skills, so you can separate model quality from gateway behavior.
- Use `session_key` to compare intentional continuity against the default stateless HTTP behavior.
- Use `openclaw:agent:<agent-id>` for full agent-loop behavior such as reasoning level, streaming,
  and skill-following workflows.
- Use `openclaw:responses` for item-based inputs, client tools, files, images, and
  `previous_response_id` flows.
- Use `openclaw:tools:<tool>` for stable direct-tool checks and expected policy denials.
- Measure cold-start and warm-turn latency separately; OpenClaw can spend real time loading runtime
  plugins, tools, and skills before the model answers.
- Use `--max-concurrency 1` when you want clean latency or session measurements. Higher concurrency
  can make gateway preparation and shared session writes contend with each other.

## Experiment suite

The example directory includes a broader suite than the default smoke config:

| File                                   | What it covers                                                       |
| -------------------------------------- | -------------------------------------------------------------------- |
| `promptfooconfig.support-triage.yaml`  | Support-triage quality                                               |
| `promptfooconfig.backend-parity.yaml`  | Backend-model override parity                                        |
| `promptfooconfig.responses-tools.yaml` | Responses API client-function tool selection and argument extraction |
| `promptfooconfig.responses-file.yaml`  | File input for a PR-review style workflow                            |
| `promptfooconfig.responses-image.yaml` | Multimodal image input                                               |
| `promptfooconfig.security.yaml`        | Indirect prompt-injection resistance for an untrusted file           |
| `promptfooconfig.session.yaml`         | Explicit HTTP session continuity                                     |
| `promptfooconfig.agent.yaml`           | Native WS agent loop                                                 |
| `promptfooconfig.skills.yaml`          | Skill loading and adherence through the WS agent provider            |
| `promptfooconfig.skill-csv.yaml`       | Skill-backed CSV analysis workflow                                   |
| `promptfooconfig.embeddings.yaml`      | Embedding-backed similarity assertions                               |
| `promptfooconfig.tools.yaml`           | Direct tool invocation on a stable built-in tool                     |

Run one experiment at a time:

```bash
npx promptfoo@latest eval -c promptfooconfig.support-triage.yaml
npx promptfoo@latest eval -c promptfooconfig.backend-parity.yaml
npx promptfoo@latest eval -c promptfooconfig.responses-tools.yaml
npx promptfoo@latest eval -c promptfooconfig.responses-file.yaml
```

`scripts/probe-openresponses.mjs` covers gateway checks that are easier to express as direct protocol
probes than as a static promptfoo config, including `/healthz`, model discovery, SSE streaming,
`previous_response_id`, rich inputs, client-function round trips, and allow/deny behavior on
`/tools/invoke`.

```bash
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789 \
OPENCLAW_GATEWAY_TOKEN=your-token-here \
node scripts/probe-openresponses.mjs
```

## Skills

Promptfoo does not upload skills per request. To eval skill behavior, configure the skill set in
OpenClaw first, usually in a dedicated agent workspace, verify it with
`openclaw skills list --eligible`, and then target that agent from promptfoo. That keeps skill
fixtures deterministic and avoids mixing skill setup with the thing you are measuring.

This example includes `skills/qa-protocol/SKILL.md` as a deterministic fixture and
`skills/csv-brief/SKILL.md` as a small realistic data-workflow fixture. Copy the relevant directory
into the workspace used by the target agent, restart the gateway or start a new session, and then run
`promptfooconfig.skills.yaml` or `promptfooconfig.skill-csv.yaml`.

Skill-heavy WS agent workflows can need a larger `timeoutMs` on a cold gateway because runtime setup
may dominate the first turn before the model starts answering.
