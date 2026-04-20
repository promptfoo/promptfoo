# Agent Documentation

Guidance for AI agents editing the reusable docs in `docs/agents/`.

## Rules

- When changing PR workflow guidance, update both `docs/agents/pr-conventions.md` and
  the root `AGENTS.md` "Pull Request Creation" section in the same PR.
- When changing dependency workflow guidance, keep
  `docs/agents/dependency-management.md` aligned with the root npm/audit guidance.
- Do not introduce hard-coded local env-file requirements into generic eval commands.
  Use `--env-file .env` only when credentials are needed and the file exists.
- Do not claim that eval exit code 0 means all test cases passed unless the text
  accounts for `PROMPTFOO_PASS_RATE_THRESHOLD`.
- Verify implementation claims against source before documenting paths, defaults, or
  environment variables, and avoid machine-specific paths.
- Prefer concrete command examples over broad advice, and avoid duplicating long
  guidance from root docs.

## Validation

For docs-only edits here, run:

```bash
npm run f
git diff --check
```
