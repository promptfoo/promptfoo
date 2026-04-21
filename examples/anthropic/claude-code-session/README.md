# anthropic/claude-code-session (Authenticate via Claude Code session)

This example shows how to run Promptfoo evals against the Anthropic Messages
API — including `llm-rubric` model-graded assertions — by reusing an existing
local Claude Code session instead of creating a separate Anthropic Console API
key.

It's meant for Claude Pro / Max subscribers who already use the
[`claude` CLI](https://docs.claude.com/en/docs/claude-code/overview) on the
same machine.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/claude-code-session
cd anthropic/claude-code-session
```

## Prerequisites

1. Install and log in to Claude Code:

   ```bash
   claude /login
   ```

   Promptfoo reads the OAuth credential that Claude Code stores in either the
   macOS keychain (`Claude Code-credentials`) or
   `$HOME/.claude/.credentials.json`.

2. Make sure `ANTHROPIC_API_KEY` is **unset** if you specifically want
   Promptfoo to use your Claude Code session. If the env var is set, Promptfoo
   will prefer it over the OAuth credential.

## How it works

The provider config sets `apiKeyRequired: false`, which tells Promptfoo to:

- Skip its upfront API key check.
- Load the Claude Code OAuth credential from the local session.
- Authenticate Messages API requests with a Bearer token plus the
  `claude-code-20250219,oauth-2025-04-20` beta headers.
- Prepend the required Claude Code identity system block
  (`"You are Claude Code, Anthropic's official CLI for Claude."`) before your
  own system prompt.

Requests made this way are expected to count against your Claude
subscription the same way calls from the `claude` CLI do. Check
[Anthropic's documentation](https://docs.claude.com/en/docs/claude-code/overview)
for current billing behavior.

## Run it

```bash
promptfoo eval
promptfoo view
```

## Configuration

See `promptfooconfig.yaml` — both the main provider and the `llm-rubric`
grader point at `anthropic:messages:claude-sonnet-4-6` with
`apiKeyRequired: false` so the entire eval runs on your Claude subscription.
