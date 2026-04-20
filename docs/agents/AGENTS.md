# Agent Documentation

Guidance for AI agents editing the reusable docs in `docs/agents/`.

## Scope

These files are implementation-facing instructions for future coding agents. Keep them
specific, testable, and consistent with the root `AGENTS.md`.

## Consistency Rules

- When changing PR workflow guidance, update both `docs/agents/pr-conventions.md` and
  the root `AGENTS.md` "Pull Request Creation" section in the same PR.
- When changing dependency workflow guidance, keep
  `docs/agents/dependency-management.md` aligned with the root npm/audit guidance.
- Do not introduce hard-coded local env-file requirements into generic eval commands.
  Use `--env-file .env` only when credentials are needed and the file exists.
- Do not claim that eval exit code 0 means all test cases passed unless the text also
  accounts for `PROMPTFOO_PASS_RATE_THRESHOLD`. Prefer telling agents to inspect
  structured output for per-test details.
- Verify implementation claims against source before documenting paths, defaults, or
  environment variables. Avoid machine-specific paths unless the doc is explicitly
  about a local worktree.

## Style

- Prefer concrete command examples over broad advice.
- Keep terminology consistent: use "Renovate PR" for Renovate-authored PRs and
  "gap analysis" unless an acronym is defined.
- Do not duplicate long guidance from root docs; link or briefly summarize the local
  rule and name the authoritative file.

## Validation

For docs-only edits here, run:

```bash
npm run f
git diff --check
```
