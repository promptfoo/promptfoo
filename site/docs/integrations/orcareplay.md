---
title: OrcaReplay record and replay
sidebar_label: OrcaReplay
description: Record OpenAI-compatible Promptfoo provider requests with OrcaReplay, replay saved responses, and verify capture while avoiding cache and endpoint conflicts.
---

# OrcaReplay integration

[OrcaReplay](https://github.com/Continuum-AI-Corp/OrcaReplay) can record HTTP requests from a
promptfoo evaluation and serve the recorded responses during a later run. This is useful
for checking local evaluation changes against fixed provider responses.

## Setup

Install promptfoo and OrcaReplay in an environment that meets [promptfoo's requirements](/docs/installation/):

```bash
npm install -g promptfoo orcareplay
```

For an evaluation using `openai:chat:*`, record a run with caching disabled:

```bash
orca record generic-openai -- promptfoo eval --no-cache
```

Recording sends real provider requests and can incur API charges. Then, from the same
directory, replay the recorded command:

```bash
orca replay last
```

The recorded command retains `--no-cache`, so the replay exercises OrcaReplay instead of
returning responses from promptfoo's cache. Check OrcaReplay's capture and replay summaries
to confirm that the expected requests were recorded and matched.

## Route requests through the recorder

The `generic-openai` adapter sets `OPENAI_BASE_URL` for the child process. Promptfoo's
OpenAI providers support this variable, but an explicit `config.apiHost` or
`config.apiBaseUrl` takes precedence. `OPENAI_API_HOST` and `OPENAI_API_BASE_URL` also take
precedence over `OPENAI_BASE_URL`.

Remove those conflicting settings from the configuration used for recording and replay.
Also remove `OPENAI_BASE_URL` from top-level `env`, provider `env`, and environment files
loaded with `--env-file`: these scopes override the child-process variable set by OrcaReplay.
Otherwise, recording and replay can bypass the recorder and send billable requests to
the configured endpoint.
If you need a custom upstream gateway, configure it through OrcaReplay and verify the
captured request count. Setting only `OPENAI_API_BASE` does not change promptfoo's OpenAI
endpoint.

## Limits

- A replay uses recorded provider responses. It does not demonstrate that a model is
  deterministic or that a fresh evaluation would produce the same output.
- Capture depends on the provider, endpoint, and OrcaReplay adapter. Verify coverage for
  every request used by your evaluation, including model-graded assertions and embeddings.
- Replay is not a sandbox. Custom providers, assertions, hooks, and other evaluation code
  can still access the network or change local state. Provider calls that bypass the
  recorder are outside this workflow.
- Model-graded assertions that replay recorded responses do not obtain a fresh model judgment.
- OrcaReplay's `--from` and `--model` options create a live continuation. They can send new
  model requests and incur charges; they are not an offline replay.

The basic record/replay workflow was checked with promptfoo 0.124.1 and OrcaReplay 0.5.0
against a local OpenAI-compatible fixture. After recording one successful evaluation,
the same command replayed successfully with the upstream fixture stopped.
