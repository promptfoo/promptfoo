# google-interactions (Gemini Interactions API)

This example demonstrates the [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview), which went GA in June 2026 and is Google's primary interface for Gemini models and agents. `generateContent` is now the legacy path.

Promptfoo uses Interactions by default for `google:` chat models, so these configs mostly show what that default does and how to opt out of it.

You can run this example with:

```bash
npx promptfoo@latest init --example google-interactions
cd google-interactions
```

## Prerequisites

- Google AI Studio API key set as `GOOGLE_API_KEY` or `GEMINI_API_KEY` in your environment
- For `promptfooconfig.vertex.yaml` only: `gcloud auth application-default login` and a Google Cloud project (Vertex refuses API-key auth)

## Overview

Bare `google:` chat providers use Interactions unless you opt out with `interactions: false` or hit a capability fallback. The `google:interactions:` prefix forces it explicitly, at the cost of changing the provider id.

| Config                          | Shows                                                         |
| ------------------------------- | ------------------------------------------------------------- |
| `promptfooconfig.yaml`          | Both opt-in styles side by side with legacy `generateContent` |
| `promptfooconfig.tools.yaml`    | Function calling, with and without `functionToolCallbacks`    |
| `promptfooconfig.stateful.yaml` | Opt-in server-side history via `store: true`                  |

## Retention

Google stores interactions by default (55 days on the paid tier). Promptfoo sends `store: false` so eval and red-team payloads are not retained; function calling still works because the tool loop resends history inline. Set `store: true` only when you want server-side history, then pass `metadata.interactionId` as `previousInteractionId` to continue a thread.

## Usage

```bash
promptfoo eval -c promptfooconfig.yaml
promptfoo eval -c promptfooconfig.tools.yaml
promptfoo eval -c promptfooconfig.stateful.yaml
promptfoo eval -c promptfooconfig.fallback.yaml
promptfoo eval -c promptfooconfig.vertex.yaml
promptfoo view
```
