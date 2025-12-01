# AGENTS.md

Guidance for AI agents working on this TypeScript codebase.

## Project Overview

Promptfoo is an open-source framework for evaluating and testing LLM applications.

## Project Structure

| Directory        | Purpose                       | Local Docs                |
| ---------------- | ----------------------------- | ------------------------- |
| `src/`           | Core library                  | -                         |
| `src/app/`       | Web UI (React 19/Vite/MUI v7) | `src/app/AGENTS.md`       |
| `src/commands/`  | CLI commands                  | `src/commands/AGENTS.md`  |
| `src/providers/` | LLM providers                 | `src/providers/AGENTS.md` |
| `src/redteam/`   | Security testing              | `src/redteam/AGENTS.md`   |
| `src/server/`    | Backend server                | `src/server/AGENTS.md`    |
| `test/`          | Tests (Vitest preferred)      | `test/AGENTS.md`          |
| `site/`          | Docs site                     | `site/AGENTS.md`          |
| `site/docs/`     | Doc content                   | `site/docs/AGENTS.md`     |
| `examples/`      | Example configs               | `examples/AGENTS.md`      |
| `drizzle/`       | DB migrations                 | `drizzle/AGENTS.md`       |

**Read the relevant AGENTS.md when working in that directory.**

## Essential Commands

```bash
npm run build          # Build project
npm test               # Run tests
npm run l              # Lint changed files
npm run f              # Format changed files
npm run local -- eval  # Test with local build
```

**Important:** Always use `--` before flags with `npm run local`:

```bash
npm run local -- eval --max-concurrency 1  # Correct
npm run local eval --max-concurrency 1     # Wrong - flags go to npm
```

**Before committing:** `npm run l && npm run f`

## Running Evaluations

**Always run from the repository root**, not from subdirectories.

**Always use `--no-cache` during development** to ensure fresh results:

```bash
npm run local -- eval -c examples/my-example/promptfooconfig.yaml --env-file .env --no-cache
```

**Export and inspect results** to verify pass/fail/errors:

```bash
npm run local -- eval -c path/to/config.yaml -o output.json --no-cache
```

Review the output file for `success`, `score`, and `error` fields. Ensure results are as expected before considering the eval complete.

## Debugging & Troubleshooting

**Verbose logging:**

```bash
npm run local -- eval -c config.yaml --verbose
# Or set environment variable
LOG_LEVEL=debug npm run local -- eval -c config.yaml
```

**Disable cache** (results may be cached during development):

```bash
npm run local -- eval -c config.yaml --no-cache
```

**View results in web UI:** First check if a server is already running on port 3000, then ask the user before starting. Use `npm run dev` to start server + frontend on localhost:3000.

**Database:** Located at `~/.promptfoo/promptfoo.db` (SQLite). You may read from it but **NEVER delete it**.

## Git Safety (CRITICAL)

- **NEVER** commit/push directly to main
- **NEVER** use `--force` or `--amend` without explicit approval
- All changes go through pull requests

See `docs/git-workflow.md` for full workflow.
See `docs/pr-conventions.md` for PR title format.

## Code Style

Handled by Biome linter - don't manually enforce style rules. Run `npm run l && npm run f` to auto-fix.

## Logging

Use the logger with object context (auto-sanitized). See `docs/logging.md` for details.

## Testing

- **Vitest** is the preferred test framework for new tests
- Frontend tests (`src/app/`): Always use Vitest
- Legacy tests in `test/`: Jest (migrating to Vitest)

See `test/AGENTS.md` for testing patterns.

## Project Conventions

- CommonJS modules
- Node.js >=20.0.0
- Drizzle ORM for database
- Don't edit `CHANGELOG.md` (auto-generated)

## Before Writing Code

- **Search for existing implementations** before creating new code
- **Check for existing utilities** in `src/util/` before adding helpers
- **Don't add dependencies** without checking if functionality exists in current deps
- **Reuse patterns** from similar files in the codebase

## Additional Documentation

Read these when relevant to your task:

| Document                        | When to Read             |
| ------------------------------- | ------------------------ |
| `docs/pr-conventions.md`        | Creating pull requests   |
| `docs/git-workflow.md`          | Git operations           |
| `docs/dependency-management.md` | Updating packages        |
| `docs/logging.md`               | Adding logging to code   |
| `docs/python.md`                | Python providers/scripts |
