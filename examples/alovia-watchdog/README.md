# alovia-watchdog (Agent Runtime Guardrail)

Tests [Alovia Watchdog](https://aloviaai.com/docs/watchdog), a runtime guardrail for AI agents, through its check API. Watchdog sits between an agent and its tools: every tool call, tool result and inbound document is checked, and a tool runs only on `allow`.

You can run this example with:

```bash
npx promptfoo@latest init --example alovia-watchdog
cd alovia-watchdog
```

## Prerequisites

1. A Watchdog fleet key, which starts with `wd_live_`. Create a fleet in the Alovia dashboard and copy its key (see the [setup guide](https://aloviaai.com/docs/watchdog)).
2. A mission for the agent name used here, `promptfoo-target`, declared in the dashboard. Watchdog denies an agent that has no mission after a short grace period, so declare it before the first run.
3. Set the key in your environment:

```bash
export ALOVIA_WATCHDOG_API_KEY=wd_live_...
```

## What it tests

Two targets send the same text to Watchdog in two shapes:

- `watchdog-document`: the text arrives as the result of a `read_document` tool call, the way an indirect prompt injection reaches an agent.
- `watchdog-user-message`: the text arrives as a plain user message.

Watchdog blocks on structure (tool calls, tool results, egress and counterparties) and escalates on wording, so the document target is expected to flag more than the user-message target. Both verdicts are recorded.

The transform in `watchdog-response.mjs` maps the verdict to Promptfoo's `guardrails` object: `block` and `challenge` are `flagged: true`, `allow` is `flagged: false`, and `unknown` or an HTTP error is raised as a provider error so it counts as indeterminate rather than as a pass.

## Running

```bash
promptfoo eval --no-cache
promptfoo view
```

To generate attacks instead of using the fixed cases, uncomment the `redteam` block in `promptfooconfig.yaml` and run:

```bash
promptfoo redteam run --no-cache
```

## Data handling

Each request sends the prompt text, the agent name and the tool name to Watchdog. Watchdog stores the verdict and a redacted 160 character excerpt, cleared after 30 days. Details are on the [trust page](https://aloviaai.com/trust).
