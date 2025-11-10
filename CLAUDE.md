# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `npx jest path/to/test-file` - Run a specific test
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
- Follow Jest best practices with describe/it blocks
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

5. **Push and create PR**:

   ```bash
   git push -u origin feature/your-branch-name
   gh pr create --title "Your PR Title" --body "PR description"
   ```

6. **Wait for review and CI checks** before merging

## Changelog

All user-facing changes must be documented in `CHANGELOG.md`. The changelog is enforced via GitHub Actions.

### When to Update

**IMPORTANT: ALL merged PRs must be documented in the changelog.**

Update the changelog for EVERY pull request, including:

- New features or functionality
- Bug fixes
- Breaking changes
- API changes
- Provider additions or updates
- Configuration changes
- Performance improvements
- Deprecated features
- Dependency updates
- Test changes
- Build configuration changes
- Code style/formatting changes
- CI/CD changes
- Documentation updates

### Bypass Labels

PRs can bypass changelog requirements with one of these labels:

1. `no-changelog` - For exceptional cases (automated bot PRs, reverts of unmerged changes)
2. `dependencies` - For automated dependency updates (Dependabot, Renovate, etc.)

### Changelog Format

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- New features go here (#PR_NUMBER)

### Changed

- Changes to existing functionality (#PR_NUMBER)

### Fixed

- Bug fixes (#PR_NUMBER)

### Dependencies

- Dependency updates (#PR_NUMBER)

### Documentation

- Documentation changes (#PR_NUMBER)

### Tests

- Test additions or changes (#PR_NUMBER)

## [1.2.3] - 2025-10-15

### Added

- Feature that was added (#1234)
```

### Entry Format

Each entry should:

1. **Include reference**: Add PR number `(#1234)` when available; use short commit hash `(abc1234)` only if no PR exists
2. **Use conventional commit prefix**: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
3. **Use `!` for breaking changes**: Add `!` after scope: `feat(api)!:`, `chore(cli)!:`
4. **Include contributor attribution**: Add `by @username` before reference when contributor is known
5. **Be concise**: One line describing the change
6. **Be user-focused**: Describe what changed, not how

### Recommended Scopes

Use these standardized scopes for consistency (based on git history analysis):

- **providers** - Provider implementations (OpenAI, Anthropic, LocalAI, etc.)
- **webui** - Web interface and viewer
- **cli** - Command-line interface
- **assertions** - Assertion types and grading
- **api** - Public API changes
- **config** - Configuration handling
- **deps** - Dependencies (or use Dependencies section)
- **docs** - Documentation
- **tests** - Test infrastructure
- **examples** - Example configurations
- **redteam** - Red team features (newer versions)
- **site** - Documentation site

### Categories

- **Added**: New features
- **Changed**: Changes to existing functionality (refactors, improvements, chores, CI/CD)
- **Fixed**: Bug fixes
- **Dependencies**: ALL dependency updates
- **Documentation**: Documentation additions or updates
- **Tests**: ALL test additions or changes
- **Removed**: Removed features (rare, usually breaking)

### Examples

Good entries:

```markdown
### Added

- feat(providers): add TrueFoundry LLM Gateway provider (#5839)
- feat(redteam): add test button for request and response transforms in red-team setup UI (#5482)
- feat(cli): add glob pattern support for prompts (a1b2c3d)
- feat(api)!: simplify the API and support unified test suite definitions by @typpo (#14)

### Fixed

- fix(evaluator): support `defaultTest.options.provider` for model-graded assertions (#5931)
- fix(webui): improve UI email validation handling when email is invalid; add better tests (#5932)
- fix(cache): ensure cache directory exists before first use (423f375)

### Changed

- chore(providers): update Alibaba model support (#5919)
- chore(env)!: rename `OPENAI_MAX_TEMPERATURE` to `OPENAI_TEMPERATURE` (4830557)
- refactor(webui): improve EvalOutputPromptDialog with grouped dependency injection (#5845)
```

Bad entries (missing reference, too vague, inconsistent format):

```markdown
### Added

- Added new feature
- Updated provider
- New feature here
```

### Adding Entries

1. **Add to Unreleased section**: All new entries go under `## [Unreleased]` at the top of the file
2. **Choose correct category**: Added, Changed, Fixed, Dependencies, Documentation, Tests
3. **Include reference**: PR number `(#1234)` when available, or short commit hash `(abc1234)` if no PR
4. **Keep conventional commit prefix**: feat:, fix:, chore:, docs:, test:
5. **One line per change**: Brief and descriptive

Example workflow:

```bash
# 1. Make your changes
# 2. Before creating PR, update CHANGELOG.md

# Add entry under ## [Unreleased] in appropriate category:
- feat(providers): add new provider for XYZ (#PR_NUMBER)

# 3. Commit changelog with your changes
git add CHANGELOG.md
git commit -m "feat(providers): add new provider for XYZ"
```

### Notes

- Maintainers move entries from Unreleased to versioned sections during releases
- Don't worry about version numbers - focus on the Unreleased section
- If unsure about categorization, use Changed
- ALL dependencies, tests, CI changes must be included (no exemptions)

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
- Follow file structure: core logic in src/, tests in test/
- Examples belong in examples/ with clear README.md
- Document provider configurations following examples in existing code
- Test both success and error cases for all functionality
- Keep code DRY and use existing utilities where possible
- Use Drizzle ORM for database operations
- Workspaces include src/app and site directories
