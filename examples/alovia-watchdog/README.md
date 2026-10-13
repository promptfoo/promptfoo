# alovia-watchdog (Agent Runtime Guardrail)

Tests [Alovia Watchdog](https://aloviaai.com/docs/watchdog), a runtime guardrail for AI agents, through its check API. Watchdog sits between an agent and its tools: every tool call, tool result and inbound document is checked, and a tool runs only on `allow`.

You can run this example with:

```bash
npx promptfoo@latest init --example alovia-watchdog
cd alovia-watchdog
```

## Prerequisites

1. A Watchdog fleet key, which starts with `wd_live_`. Create a fleet in the Alovia dashboard and copy its key (see the [setup guide](https://aloviaai.com/docs/watchdog)).
2. The fleet's deploy key, which starts with `wd_deploy_`, minted in the same dashboard. It is only used once, to declare the mission.
3. The mission the fixed cases assume, declared for the agent name `promptfoo-target` by running `mission.py` with the deploy key. It allows `read_document` and `search_kb` only, denies unlisted tools, allows no outbound destinations and binds counterparties. Watchdog denies an agent that has no mission after a short grace period, and a different mission gives different verdicts, so run this before the first eval:

```bash
pip install alovia-watchdog
ALOVIA_WATCHDOG_DEPLOY_KEY=wd_deploy_... python mission.py
```

4. Set the runtime key in your environment:

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

To generate attacks instead of using the fixed cases, use `promptfooconfig.redteam.yaml`. It adds `not-guardrails` to every generated attack, so an attack Watchdog did not flag fails outright instead of being graded on the transform's "allowed" string, and `guardrails` with `purpose: redteam`, so a flagged attack passes over every other assertion, which is right for Watchdog because a block is an enforced stop.

```bash
promptfoo redteam run -c promptfooconfig.redteam.yaml --no-cache
```

## Data handling

Each request sends the prompt text, the agent name and the tool name to Watchdog. Watchdog stores the verdict and a redacted 160 character excerpt, cleared after 30 days. Details are on the [trust page](https://aloviaai.com/trust).
