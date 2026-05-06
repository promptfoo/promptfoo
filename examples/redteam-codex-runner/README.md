# redteam-codex-runner (Codex Runner Red Team)

Run Hydra and `jailbreak:meta` locally with Codex as the agentic attack brain.

```bash
npx promptfoo@latest init --example redteam-codex-runner
cd redteam-codex-runner
```

From this repository, test with the local build:

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true \
  npm run local -- redteam run \
  -c examples/redteam-codex-runner/promptfooconfig.yaml \
  --env-file .env \
  --no-cache \
  --max-concurrency 1
```

Requirements:

- Codex login in `~/.codex/auth.json`, or Codex-compatible API credentials.
- `OPENAI_API_KEY` in `.env` for the fixture target agent.

The target agent is intentionally tiny. The interesting part is the attack brain: `redteam.agentic.mode: local` routes agentic strategy decisions through `openai:codex-app-server` instead of Promptfoo Cloud.
