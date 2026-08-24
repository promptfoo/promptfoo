# openai-codex-security (OpenAI Codex Security Scan Comparison)

Compare Codex Security standard and deep scans across models and reasoning settings using the same intentionally vulnerable repository fixture.

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
npm install @openai/codex-security@^0.1.18
```

Use Node.js `^22.13.0`, `^24.0.0`, or `^26.0.0`. Authenticate with an existing Codex login or set `OPENAI_API_KEY` or `CODEX_API_KEY` before running the eval:

```bash
promptfoo eval --no-cache
```

The example compares:

- `security-scan` using `gpt-5.6-terra` with medium reasoning.
- `security-scan` using `gpt-5.6-sol` with high reasoning.
- `deep-security-scan` using `gpt-5.6-sol` with high reasoning and two workers.

Each provider returns structured findings, repository coverage, token usage, and SDK-estimated cost when available. The fixture intentionally contains command injection; do not deploy or expose it.

To compare your own repository, change each provider's `repository` setting. Managed security scans require an authorized repository and may require Trusted Access. Use an isolated checkout when enabling `operation: fix-finding` and `allow_file_writes: true`.

See the [Codex Security SDK provider documentation](https://www.promptfoo.dev/docs/providers/openai-codex-security/) for the complete operation list, model and reasoning options, finding assertions, cost accounting, and remediation safety requirements.
