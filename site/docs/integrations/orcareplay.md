---
sidebar_label: OrcaReplay
description: Record a promptfoo eval once, then re-run it offline with no model called and no tokens spent
---

# OrcaReplay integration

[OrcaReplay](https://github.com/Continuum-AI-Corp/OrcaReplay) records the HTTP exchange
between a process and its model provider, then replays it later with no provider
contacted. Running it around `promptfoo eval` lets you re-run the same eval as many times
as you like without paying for it again.

It is not a hosted service and needs no account: it is an Apache-2.0 CLI (Node 20+) that
writes a local trace and serves it back.

## Setup

```bash
npm i -g orcareplay
```

Record one real eval, then replay it:

```bash
orca record generic-openai -- promptfoo eval   # real run, recorded
orca replay last                               # same run, no model called
```

Nothing in `promptfooconfig.yaml` changes. `orca record generic-openai` sets
`OPENAI_BASE_URL` for the child process and proxies that origin.

:::note Use `OPENAI_BASE_URL`, not `OPENAI_API_BASE`

Measured on promptfoo 0.123.0 against a local endpoint:

- `OPENAI_BASE_URL=http://127.0.0.1:9977/v1` — the `openai:chat:*` provider sends
  `POST /v1/chat/completions` to that endpoint and the eval passes.
- `OPENAI_API_BASE=http://127.0.0.1:9977/v1` — **not** honoured; the request goes to the
  real API.

Both spellings are common across the ecosystem, so it is worth pointing the right one at
whatever proxy or gateway you use. Pointing the wrong one gives you a run that quietly
went to production.

:::

Disable the cache while recording so every call actually reaches the provider and ends up
in the trace:

```bash
PROMPTFOO_CACHE_ENABLED=false orca record generic-openai -- promptfoo eval
```

## Comparing models against a fixed prefix

Because the recording holds the whole exchange, a run can be resumed on a different model
from any step:

```bash
orca replay last --from 4 --model claude-haiku-4-5
```

Everything before step 4 is byte-identical to the recorded run, so the model is the only
variable.

## Limits

- **A matching replay is not a determinism result.** It proves the recorded exchange
  reproduces, not that the provider is deterministic, and not that a fresh eval would
  produce the same outputs.
- **Replay blocks model-provider egress only. It is not a sandbox.** Anything else your
  eval does — a custom provider that calls your own API, a Python assertion that hits the
  network — still runs for real.
- **Embedding calls are not captured by the default adapter**, so `similar`-style
  assertions will not be served from the recording.
- Graded assertions that call a model are themselves provider calls: they are recorded
  and replayed like any other, which is usually what you want, but it means a replayed
  eval is only as current as the recording.
