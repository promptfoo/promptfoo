# openai-codex-security (OpenAI Codex Security Scan Comparison)

Compare Codex Security standard and deep scans across models and reasoning settings using the same intentionally vulnerable repository fixture.

## Setup

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
npm install @openai/codex-security@^0.1.18
```

Use Node.js `^22.13.0`, `^24.0.0`, or `^26.0.0`. Authenticate with an existing Codex login or set `OPENAI_API_KEY` or `CODEX_API_KEY` before running the eval:

```bash
promptfoo eval --no-cache
```

## Evaluate scan models and depth

The example compares:

- `security-scan` using `gpt-5.6-terra` with medium reasoning.
- `security-scan` using `gpt-5.6-sol` with high reasoning.
- `deep-security-scan` using `gpt-5.6-sol` with high reasoning and two workers.

Each provider returns structured findings, repository coverage, token usage, and SDK-estimated cost when available. The fixture intentionally trusts a client-controlled administrator header, creating an authorization bypass; do not deploy or expose it.

To compare your own repository, change each provider's `repository` setting. Managed security scans require an authorized repository and may require Trusted Access.

See the [Codex Security SDK provider documentation](https://www.promptfoo.dev/docs/providers/openai-codex-security/) for supported native operations, model and reasoning options, finding assertions, and cost accounting.
