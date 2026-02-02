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
| `test/`          | Tests (Vitest)                | `test/AGENTS.md`          |
| `site/`          | Docs site (Docusaurus)        | `site/AGENTS.md`          |
| `examples/`      | Example configs               | `examples/AGENTS.md`      |
| `drizzle/`       | DB migrations                 | `drizzle/AGENTS.md`       |

**Read the relevant AGENTS.md when working in that directory.**

## Build Commands

```bash
# Core commands
npm run build              # Build the project
npm run build:clean        # Clean the dist directory
npm run build:watch        # Watch and rebuild TypeScript files
npm test                   # Run all tests
npm run tsc                # Run TypeScript compiler

# Linting & Formatting
npm run lint               # Run Biome linter (alias for lint:src)
npm run lint:src           # Lint src directory
npm run lint:tests         # Lint test directory
npm run lint:site          # Lint site directory
npm run format             # Format all files (Biome + Prettier)
npm run format:check       # Check formatting without changes
npm run l                  # Lint only changed files
npm run f                  # Format only changed files

# Testing
npm run test:watch         # Run tests in watch mode
npm run test:integration   # Run integration tests
npm run test:redteam:integration  # Run red team integration tests
npx vitest path/to/test    # Run a specific test file

# Development
npm run dev                # Start both server and app
npm run dev:app            # Start only frontend (localhost:5173)
npm run dev:server         # Start only server (localhost:3000)
npm run local -- eval      # Test with local build

# Database
npm run db:generate        # Generate Drizzle migrations
npm run db:migrate         # Run database migrations
npm run db:studio          # Open Drizzle studio

# Other
npm run jsonSchema:generate  # Generate JSON schema for config
npm run citation:generate    # Generate citation file
```

## Testing in Development

When testing changes, use the local build:

```bash
npm run local -- eval -c path/to/config.yaml
```

**Important:** Always use `--` before flags with `npm run local`:

```bash
npm run local -- eval --max-concurrency 1  # Correct
npm run local eval --max-concurrency 1     # Wrong - flags go to npm
```

**Don't run `npm run local -- view`** unless explicitly asked. Assume the user already has `npm run dev` running. The `view` command serves static production builds without hot reload.

### Using Environment Variables

The repository includes a `.env` file for API keys. To use it:

```bash
# Use --env-file flag to load environment variables
npm run local -- eval -c config.yaml --env-file .env

# Or set specific variables inline
OPENAI_API_KEY=sk-... npm run local -- eval -c config.yaml

# Disable remote generation for testing
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npm run local -- eval -c config.yaml
```

**Never commit the `.env` file or expose API keys in code or commit messages.**

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

Review the output file for `success`, `score`, and `error` fields.

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

**View results in web UI:** First check if a server is running on port 3000, then ask user before starting. Use `npm run dev` for localhost:3000.

**Cache:** Located at `~/.cache/promptfoo`. **NEVER delete or clear the cache without explicit permission.** Use `--no-cache` flag instead.

**Database:** Located at `~/.promptfoo/promptfoo.db` (SQLite). You may read from it but **NEVER delete it**.

## Git Workflow (CRITICAL)

- **NEVER** commit/push directly to main
- **NEVER** use `--force` without explicit approval
- **NEVER** comment on GitHub issues - only create PRs to address them
- **ALWAYS create new commits** - never amend, squash, or rebase unless explicitly asked
- All changes go through pull requests

**Standard workflow:**

```bash
git checkout main && git pull origin main   # Always start fresh
git checkout -b feature/your-branch-name    # New branch for changes
# Make changes...
git add <specific-files>                    # Never blindly add everything
npm run l && npm run f                      # Lint and format before commit/push
git commit -m "type(scope): description"    # Conventional commit format
git fetch origin main && git merge origin/main  # Sync with main
git push -u origin feature/your-branch-name # Push branch
```

**Conventional commit types:** `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf`

See `docs/agents/git-workflow.md` for full workflow.
See `docs/agents/pr-conventions.md` for PR title format and scope selection (especially THE REDTEAM RULE).

## Screenshots for Pull Requests

GitHub has no official API for uploading images to PR descriptions. When asked to add screenshots to a PR:

1. **Take the screenshot** using browser tools or other methods
2. **Upload to freeimage.host** (no API key required):

```bash
curl -s -X POST \
  -F "source=@/path/to/screenshot.png" \
  -F "type=file" \
  -F "action=upload" \
  "https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5" \
  | jq -r '.image.url'
```

3. **Update the PR body** with the returned URL:

```bash
gh pr edit <PR_NUMBER> --body "$(cat <<'EOF'
## Summary
...
## Screenshot
![Screenshot](https://iili.io/XXXXXXX.png)
...
EOF
)"
```

**Do NOT:**

- Commit screenshots to the branch
- Upload to GitHub release assets
- Use GitHub's internal upload endpoints (require browser cookies, not PATs)

## Code Style Guidelines

- Use TypeScript with strict type checking
- Follow consistent import order (Biome handles sorting)
- Use consistent curly braces for all control statements
- Prefer `const` over `let`; avoid `var`
- Use object shorthand syntax whenever possible
- Use `async/await` for asynchronous code
- Use Vitest for all tests (both `test/` and `src/app/`)
- Use consistent error handling with proper type checks
- Avoid re-exporting from files; import directly from the source module

**Before committing:** `npm run l && npm run f`

## Logging

Use the logger with object context (auto-sanitized):

```typescript
logger.debug('[Component] Message', { headers, body, config });
```

See `docs/agents/logging.md` for details on sanitization patterns.

## Testing

- **Vitest** is the test framework for all tests
- Frontend tests (`src/app/`): Vitest with explicit imports
- Backend tests (`test/`): Vitest with globals enabled (`describe`, `it`, `expect` available without imports)

See `test/AGENTS.md` for testing patterns.

## Project Conventions

- **ESM modules** (type: "module" in package.json)
- **Node.js ^20.20.0 || >=22.22.0** - Use `nvm use` to align with `.nvmrc`; `.npmrc` sets `engine-strict=true`
- **Alternative package managers** (pnpm, yarn) are supported
- **File structure:** core logic in `src/`, tests in `test/`
- **Examples** belong in `examples/` with clear README.md
- **Drizzle ORM** for database operations
- **Workspaces** include `src/app` and `site` directories
- **Don't edit `CHANGELOG.md`** - it's auto-generated

## Before Writing Code

- **Search for existing implementations** before creating new code
- **Check for existing utilities** in `src/util/` before adding helpers
- **Don't add dependencies** without checking if functionality exists in current deps
- **Reuse patterns** from similar files in the codebase
- **Test both success and error cases** for all functionality
- **Document provider configurations** following examples in existing code

## Documentation Testing

When testing doc changes, speed up builds by skipping OG image generation:

```bash
cd site
SKIP_OG_GENERATION=true npm run build
```

See `site/AGENTS.md` for documentation guidelines.

## Additional Documentation

Read these when relevant to your task:

| Document                               | When to Read                   |
| -------------------------------------- | ------------------------------ |
| `docs/agents/pr-conventions.md`        | Creating pull requests         |
| `docs/agents/git-workflow.md`          | Git operations                 |
| `docs/agents/dependency-management.md` | Updating packages              |
| `docs/agents/logging.md`               | Adding logging to code         |
| `docs/agents/python.md`                | Python providers/scripts       |
| `docs/agents/database-security.md`     | Writing database queries       |
| `src/app/AGENTS.md`                    | Frontend React development     |
| `src/providers/AGENTS.md`              | Adding/modifying LLM providers |
| `test/AGENTS.md`                       | Writing tests                  |
| `site/AGENTS.md`                       | Documentation site changes     |
