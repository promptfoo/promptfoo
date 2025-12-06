# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

Promptfoo is an open-source framework for evaluating and testing LLM applications. The project is written primarily in TypeScript and includes:

- `src/`: Core library code
- `test/`: Test files
- `site/`: Documentation site (Docusaurus)
- `examples/`: Example configurations and use cases
- `src/app/`: Web UI (React)

## Frontend API Calls

When making API calls from the React app (`src/app`), always use the `callApi` function from `@app/utils/api` instead of direct `fetch()` calls. This ensures proper API base URL handling.

```typescript
import { callApi } from '@app/utils/api';

// Correct
const response = await callApi('/traces/evaluation/123');

// Incorrect - will fail in development
const response = await fetch('/api/traces/evaluation/123');
```

## Build Commands

- `npm run build` - Build the project
- `npm run build:clean` - Clean the dist directory
- `npm run build:watch` - Watch for changes and rebuild TypeScript files
- `npm run lint` - Run Biome linter (alias for lint:src)
- `npm run lint:src` - Run Biome linter on src directory
- `npm run lint:tests` - Run Biome linter on test directory
- `npm run lint:site` - Run Biome linter on site directory
- `npm run format` - Format with Biome (JS/TS) and Prettier (CSS/HTML/Markdown)
- `npm run format:check` - Check formatting without making changes
- `npm run f` - Format only changed files
- `npm run l` - Lint only changed files
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run integration tests
- `npm run test:redteam:integration` - Run red team integration tests
- `npx vitest path/to/test-file` - Run a specific test file
- `npm run dev` - Start development environment (both server and app)
- `npm run dev:app` - Start only the frontend app in dev mode
- `npm run dev:server` - Start only the server in dev mode
- `npm run tsc` - Run TypeScript compiler
- `npm run db:generate` - Generate database migrations with Drizzle
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Drizzle studio for database management
- `npm run jsonSchema:generate` - Generate JSON schema for configuration
- `npm run citation:generate` - Generate citation file

## Style Checks

When the CI style check is failing, run these commands to fix style issues:

1. **Fix all style issues automatically**:

   ```bash
   # Fix linting issues for changed files
   npm run l

   # Fix formatting issues for changed files
   npm run f

   # Or fix all files (not just changed ones)
   npm run format
   ```

2. **Before committing**, always run:

   ```bash
   npm run l && npm run f
   ```

## CLI Commands

- `promptfoo` or `pf` - Access the CLI tool

## Testing in Development

When testing changes during development, use the local build:

```bash
npm run local -- eval -c path/to/config.yaml
```

This ensures you're testing with your current changes instead of the installed version.

**Don't run `npm run local -- view`** unless explicitly asked. Assume the user already has `npm run dev` running in a separate terminal. The `view` command serves static production builds without hot reload, while the dev server at http://localhost:3000 provides HMR for faster iteration.

**Important:** Always use `--` before additional flags when using `npm run local`:

```bash
# Correct - use -- to separate npm script from CLI flags
npm run local -- eval --max-concurrency 1 --filter-first-n 1

# Incorrect - flags will be passed to npm instead of promptfoo
npm run local eval --max-concurrency 1
```

### Using Environment Variables

The repository includes a `.env` file at `~/projects/promptfoo/.env` with API keys for testing. To use it with the local build:

```bash
# Use --env-file flag to load environment variables
npm run local -- eval -c examples/tau-simulated-user/promptfooconfig.yaml --env-file ~/projects/promptfoo/.env

# Or set specific variables inline
OPENAI_API_KEY=sk-... npm run local -- eval -c path/to/config.yaml

# For testing with remote generation disabled
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npm run local -- eval -c path/to/config.yaml
```

**Never commit the `.env` file or expose API keys in code or commit messages.**

## Documentation Testing

When testing documentation changes that require building the site, you can speed up the process by skipping OG (Open Graph) image generation:

```bash
cd site
SKIP_OG_GENERATION=true npm run build
```

The OG image generation process can take several minutes and may cause CI timeouts. For documentation-only changes, skipping it is safe and recommended.

**When to use `SKIP_OG_GENERATION=true`:**

- Testing documentation changes locally
- CI builds timing out due to OG image generation
- Documentation-only PRs where OG images aren't critical

**When NOT to skip OG generation:**

- Final production builds
- When OG image changes are specifically needed
- When testing social media sharing functionality

## Code Style Guidelines

- Use TypeScript with strict type checking
- Follow consistent import order (Biome will handle import sorting)
- Use consistent curly braces for all control statements
- Prefer const over let; avoid var
- Use object shorthand syntax whenever possible
- Use async/await for asynchronous code
- Use Vitest for all tests (both backend tests in `test/` and frontend tests in `src/app/`)
- Use consistent error handling with proper type checks

### React Hooks

- **`useMemo` vs `useCallback`**: Use `useMemo` when computing a value, and `useCallback` when creating a stable function reference. Specifically:
  - Use `useMemo` when the hook returns a value that doesn't accept arguments (a non-callable)
  - Use `useCallback` when the hook returns a function that accepts arguments and will be called later

  ```typescript
  // ✅ Good - useMemo for computed values
  const tooltipMessage = useMemo(() => {
    return apiStatus === 'blocked' ? 'Connection failed' : undefined;
  }, [apiStatus]);

  // ✅ Good - useCallback for functions that accept arguments
  const handleClick = useCallback((id: string) => {
    console.log('Clicked:', id);
  }, []);

  // ❌ Bad - useCallback for computed values
  const getTooltipMessage = useCallback(() => {
    return apiStatus === 'blocked' ? 'Connection failed' : undefined;
  }, [apiStatus]);
  ```

## Python Guidelines

- Use Python 3.9 or later
- Follow the [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)
- Use type hints to improve code readability and catch potential errors
- Use `ruff` for linting and formatting
  - Run `ruff check --fix` for general linting
  - Run `ruff check --select I --fix` for import sorting
  - Run `ruff format` for formatting
- Write unit tests for new Python functions using the built-in `unittest` module
- Keep the Python codebase simple and minimal, without unnecessary external dependencies
- When adding Python examples, update relevant `requirements.txt` files
- When implementing custom providers, prompts, or asserts in Python, follow the promptfoo API patterns

## Logging and Sanitization

**IMPORTANT**: Always sanitize sensitive data before logging to prevent exposing secrets, API keys, passwords, and other credentials in logs.

### Sanitized Logging

All logger methods (`debug`, `info`, `warn`, `error`) accept an optional second parameter for context objects that will be automatically sanitized:

```typescript
import logger from './logger';

// For logging with structured context (headers, body, URLs, etc.)
logger.debug('[Provider]: Making API request', {
  url: 'https://api.example.com',
  method: 'POST',
  headers: { Authorization: 'Bearer secret-token' },
  body: { apiKey: 'secret-key', data: 'value' },
  queryParams: { token: 'secret-token' },
});
// Output: All sensitive fields automatically redacted as [REDACTED]

// Works with all log levels
logger.error('Request failed', {
  headers: response.headers,
  body: errorResponse,
});
```

### Manual Sanitization

For cases where you need to sanitize data before using it in non-logging contexts:

```typescript
import { sanitizeObject } from './util/sanitizer';

// Sanitize any object - works recursively up to 4 levels deep
const sanitizedConfig = sanitizeObject(providerConfig, {
  context: 'provider config', // optional context for error messages
});

// Sanitize response metadata before saving
const metadata = {
  headers: sanitizeObject(response.headers, { context: 'response headers' }),
  // ... other metadata
};
```

### What Gets Sanitized

The sanitizer automatically redacts these sensitive field names (case-insensitive, works with `-`, `_`, camelCase):

- **Passwords**: password, passwd, pwd, pass, passphrase
- **API Keys & Tokens**: apiKey, api_key, token, accessToken, refreshToken, bearerToken, etc.
- **Secrets**: secret, clientSecret, webhookSecret
- **Headers**: authorization, cookie, x-api-key, x-auth-token, x-access-token
- **Certificates**: privateKey, certificatePassword, pfxPassword, keystorePassword, certificateContent, etc.
- **Signatures**: signature, sig, signingKey

### When to Use Sanitization

**ALWAYS sanitize objects when logging:**

Our logging methods take in an object as the second argument and will automatically sanitize them. So anything that may contain secrets needs to be sanitized:

- HTTP request/response headers
- Request/response bodies
- Configuration objects
- Query parameters
- Error details that may contain request data

**Example - HTTP Provider:**

```typescript
// ✅ Good - uses sanitized logging (context object is automatically sanitized)
logger.debug('[HTTP Provider]: Calling endpoint', {
  url,
  method: 'POST',
  headers: requestHeaders,
  body: requestBody,
});

// ❌ Bad - exposes secrets in logs
logger.debug(`Calling ${url} with headers: ${JSON.stringify(headers)}`);
```

## Git Workflow - CRITICAL

### Rules

1. NEVER COMMIT DIRECTLY TO MAIN BRANCH
2. NEVER MERGE BRANCHES INTO MAIN DIRECTLY
3. NEVER PUSH TO MAIN BRANCH - EVER
4. **ABSOLUTELY FORBIDDEN ACTIONS:**
   - `git push origin main` or `git push main` - NEVER DO THIS
   - `git merge feature-branch` while on main - NEVER DO THIS
   - Any direct commits to main branch - NEVER DO THIS

All changes to main MUST go through pull requests and code review process.

### Workflow

Always follow this workflow:

1. **Create a feature branch**:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-branch-name
   ```

2. **Make your changes and commit**:

   ```bash
   git add .
   git commit -m "your commit message"
   ```

   NEVER blindly `git add` everything - there might be other unrelated files lying around.

   **NEVER use `git commit --amend` or `git push --force` unless explicitly asked by the user.**

3. **Lint**:

   ```bash
   npm run lint
   ```

   If there are lint errors, fix them.

4. **Format**:

   ```bash
   npm run format
   ```

   If there are formatting errors, fix them.

5. **Sync with main before pushing**:

   ```bash
   git fetch origin main
   git merge origin/main
   ```

   This ensures your branch is up-to-date with the latest changes and resolves any conflicts before creating the PR.

6. **Push and create PR**:

   ```bash
   git push -u origin feature/your-branch-name
   gh pr create --title "Your PR Title" --body "PR description"
   ```

7. **Wait for review and CI checks** before merging

## Pull Request Titles

Pull request titles must follow Conventional Commits format. PR titles become squash-merge commit messages and changelog entries, so consistency is critical.

### Format

```
<type>(<scope>): <description>
<type>(<scope>)!: <description>  # Breaking changes
```

Optional PR number suffix: `(#1234)`

### Types

- `feat` - New feature or capability
- `fix` - Bug fix
- `chore` - Maintenance, upgrades, non-breaking refactors
- `refactor` - Code refactoring without behavior change
- `docs` - Documentation only
- `test` - Test additions or changes
- `ci` - CI/CD changes
- `revert` - Revert previous change
- `perf` - Performance improvement

**Breaking changes:** Add `!` after scope: `feat(api)!:`, `chore(deps)!:`

### Scopes - Priority Order

Choose exactly ONE scope using this priority order:

#### 1. Feature Domains (HIGHEST PRIORITY)

**`redteam` - MANDATORY for ALL redteam-related changes:**

- Redteam plugins, strategies, grading
- Redteam UI components (setup, report, config dialogs)
- Redteam CLI commands
- Redteam server endpoints
- Redteam documentation
- Redteam examples
- **ANY change that mentions or touches redteam functionality**

**Examples:**

```
feat(redteam): add Hydra multi-turn adversarial strategy
fix(redteam): fix Basic strategy checkbox in setup UI
docs(redteam): document Hydra configuration options
test(redteam): add tests for meta strategy
chore(redteam): update strategy display names
```

**Other feature domains:**

- `providers` - Provider implementations and configuration
- `assertions` - Assertion types and grading logic
- `eval` or `evaluator` - Core evaluation engine (non-redteam)
- `api` - Public API surface changes

#### 2. Product Areas (when not redteam and localized)

- `webui` - React app in `src/app/`
- `cli` - CLI in `src/`
- `server` - Web server in `src/server/`
- `site` - Documentation site in `site/`

#### 3. Technical/Infrastructure

- `deps` - Dependency updates
- `ci` - CI/CD pipelines, GitHub Actions
- `tests` - Test infrastructure, utilities
- `build` - Build tooling and configuration
- `examples` - Non-redteam examples in `examples/`

#### 4. Specialized (as needed)

- `auth`, `cache`, `config`, `python`, `mcp`, `code-scan`

#### 5. No Scope

Use no scope for generic changes:

```
chore: bump version 0.119.11
feat: changelog automation
```

### THE REDTEAM RULE - MANDATORY

**If a PR is redteam-related in ANY way, use `(redteam)` scope. No exceptions.**

This rule applies even if the change is:

- Only in the UI → Still use `(redteam)`
- Only in the CLI → Still use `(redteam)`
- Only in docs → Still use `(redteam)`
- Only in examples → Still use `(redteam)`
- Only in server endpoints → Still use `(redteam)`

❌ **WRONG:**

```
fix(webui): fix Basic strategy checkbox in red team setup
feat(cli): add redteam validate command
chore(app): improve red team setup dialog
docs(site): add redteam strategy guide
```

✅ **CORRECT:**

```
fix(redteam): fix Basic strategy checkbox in setup UI
feat(redteam): add validate target CLI command
chore(redteam): improve setup dialog UX
docs(redteam): add strategy configuration guide
```

**Why?** Redteam is a cross-cutting feature domain spanning CLI, webui, server, docs, and examples. Using `(redteam)` consistently makes it easy to find all redteam work in PRs, commits, and changelog.

### Decision Tree for Scope Selection

```
1. Is this redteam-related?
   YES → Use (redteam)  [MANDATORY]
   NO  → Go to 2

2. Is it another feature domain (providers, assertions, eval, api)?
   YES → Use that domain scope
   NO  → Go to 3

3. Is it localized to one product area (webui, cli, server, site)?
   YES → Use that product scope
   NO  → Go to 4

4. Is it infrastructure (deps, ci, tests, build, examples)?
   YES → Use that infra scope
   NO  → Go to 5

5. Use no scope (generic/cross-cutting change)
```

### Examples

✅ **Good:**

```
feat(redteam): add FERPA compliance plugin
fix(redteam): respect privacy settings in meta strategy
feat(providers): add Gemini 3 Pro support with thinking configuration
fix(providers): support function providers in assertions
fix(assertions): use script output for file:// references
feat(webui): add eval results filter permalinking
feat(cli): add code-scans run command
chore(deps): update Material-UI monorepo to v8 (major)
fix(deps): update dependency better-sqlite3 to v12.4.6
docs(site): add Portkey integration guide
test(webui): add tests for evaluation components
feat(api)!: simplify provider interface
chore: bump version 0.119.11
```

❌ **Bad:**

```
feat: add new redteam thing              # Missing (redteam) scope
fix(app): provider bug                    # Should be fix(providers)
fix(webui): red team checkbox             # Should be fix(redteam)
chore(webui): update dependency           # Should be chore(deps)
feat(cli): redteam command                # Should be feat(redteam)
feat: stuff                               # Too vague
```

### Dependency Updates

- **`fix(deps)`** - Patch versions (security/bug fixes that users need)
- **`chore(deps)`** - Minor/major upgrades, bulk updates, dev dependencies

```
fix(deps): update dependency better-sqlite3 to v12.4.6
chore(deps): update Material-UI monorepo to v8 (major)
chore(deps): update 76 packages to latest versions
chore(deps): bump langchain-core in examples/redteam-langchain
```

### PR Title Checklist

Before creating a PR:

1. ✅ **Is this redteam-related?** → Use `(redteam)` scope (MANDATORY)
2. ✅ Choose type: feat/fix/chore/docs/test/refactor/ci/revert/perf
3. ✅ Not redteam? Is it a feature domain (providers/assertions/eval/api)?
4. ✅ Is it localized to one product area (webui/cli/server/site)?
5. ✅ Is it infrastructure (deps/ci/tests/build/examples)?
6. ✅ Breaking change? Add `!` after scope
7. ✅ Run `npm run l && npm run f` before committing

## Changelog

**Do not edit `CHANGELOG.md`.** It is automatically generated.

## Dependency Management

### Safe Update Workflow

When updating dependencies, use `npx npm-check-updates --target minor` for safe minor/patch updates only:

```bash
# Check all three workspaces
npx npm-check-updates --target minor              # Root
npx npm-check-updates --target minor --cwd site   # Site
npx npm-check-updates --target minor --cwd src/app # App

# Find and check example package.json files
find examples -name "package.json" -not -path "*/node_modules/*" -type f

# Apply updates with -u flag, then verify
npm run build && npm test && npm run lint && npm run format

# Check version consistency across workspaces (required by CI)
npx check-dependency-version-consistency
```

### Critical Rules

1. **PeerDependencies must match devDependencies** - Always update peerDependencies to match devDependencies versions to prevent "package not found" errors for users
2. **Update examples/** - 12+ package.json files in examples/ are user-facing; keep them current
3. **No package-lock.json** - Project intentionally omits lockfile; `npm audit` won't work
4. **If updates fail** - Revert the problematic package and keep current version until code changes allow upgrade

### Checking for Major Updates

```bash
# See available major version updates (don't apply automatically)
npx npm-check-updates --target latest

# Major updates often require code changes - evaluate each carefully
```

## Project Conventions

- Use CommonJS modules (type: "commonjs" in package.json)
- Node.js version requirement (>=20.0.0). Use `nvm use` to align with `.nvmrc` (currently v24.7.0).
- npm version is constrained via `engines.npm` in package.json. The `.npmrc` sets `engine-strict=true` to enforce this. Alternative package managers (pnpm, yarn) are also supported.
- Follow file structure: core logic in src/, tests in test/
- Examples belong in examples/ with clear README.md
- Document provider configurations following examples in existing code
- Test both success and error cases for all functionality
- Keep code DRY and use existing utilities where possible
- Use Drizzle ORM for database operations
- Workspaces include src/app and site directories
