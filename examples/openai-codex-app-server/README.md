# openai-codex-app-server (OpenAI Codex App Server Examples)

These examples evaluate Codex through the experimental `codex app-server` protocol.

## Setup

Install Codex CLI 0.156.1 or newer for these GPT-6 examples, then sign in:

```bash
npm install -g @openai/codex@^0.156.1
codex login
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
- `promptfooconfig.tracing.yaml` - Enables OTEL tracing and asserts on the `gen_ai.turn *` protocol-turn marker spans (see [Turn marker spans](https://www.promptfoo.dev/docs/tracing/#per-llm-turn-spans)).
- `approval-policy/promptfooconfig.yaml` - Demonstrates deterministic approval request handling.
- `review-diff/promptfooconfig.yaml` - Uses Codex app-server to review the current git diff.
- `skills/promptfooconfig.yaml` - Demonstrates explicit skill input items.

The skills config expects `CODEX_SKILL_CREATOR_PATH` to point at a local
`skill-creator/SKILL.md` file.

## Notes

Codex runs its own agent loop; the `openai:responses:*` provider is for direct model calls.

The provider starts its own `codex app-server` process. It does not attach to an already-running Codex Desktop app process.

The default examples use:

- `sandbox_mode: read-only`
- `approval_policy: never`
- `skip_git_repo_check: true`
- `thread_cleanup: unsubscribe`

See [OpenAI Codex App Server Provider Documentation](https://www.promptfoo.dev/docs/providers/openai-codex-app-server/) for full configuration details.
