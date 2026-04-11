# openai-codex-app-server (OpenAI Codex App Server Examples)

These examples evaluate Codex through the experimental `codex app-server` protocol.

## Setup

Install and sign in to Codex:

```bash
npm i -g @openai/codex
codex
```

You can also use an API key:

```bash
export OPENAI_API_KEY=your_api_key_here
```

## Run

From this repository:

```bash
npm run local -- eval -c examples/openai-codex-app-server/promptfooconfig.yaml --no-cache
```

With an `.env` file:

```bash
npm run local -- eval -c examples/openai-codex-app-server/promptfooconfig.yaml --env-file .env --no-cache
```

If you initialized this example separately:

```bash
npx promptfoo@latest init --example openai-codex-app-server
cd openai-codex-app-server
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

## Included Configs

- `promptfooconfig.yaml` - Read-only structured repo summary.
- `approval-policy/promptfooconfig.yaml` - Demonstrates deterministic approval request handling.
- `review-diff/promptfooconfig.yaml` - Uses Codex app-server to review the current git diff.
- `skills/promptfooconfig.yaml` - Demonstrates explicit skill input items.

The skills config expects `CODEX_SKILL_CREATOR_PATH` to point at a local
`skill-creator/SKILL.md` file.

## Notes

The provider starts its own `codex app-server` process. It does not attach to an already-running Codex Desktop app process.

The default examples use:

- `sandbox_mode: read-only`
- `approval_policy: never`
- `skip_git_repo_check: true`
- `thread_cleanup: unsubscribe`

See [OpenAI Codex App Server Provider Documentation](/docs/providers/openai-codex-app-server/) for full configuration details.
