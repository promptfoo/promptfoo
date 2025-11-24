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
7. ✅ Add PR number: `(#1234)`
8. ✅ Update CHANGELOG.md with same format (see Changelog section below)
9. ✅ Run `npm run l && npm run f` before committing

### Integration with Changelog

PR titles and changelog entries use the same format. When you create a PR:

1. Title the PR using this convention
2. Add an entry to `CHANGELOG.md` under `## [Unreleased]` with the same format
3. See the Changelog section below for detailed changelog guidelines

## Changelog

All user-facing changes must be documented in `CHANGELOG.md`.

### When to Update

**IMPORTANT: ALL PRs that modify user-facing code must be documented in the changelog.**

Update the changelog for pull requests that change:

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

Use these standardized scopes for consistency. See the "Pull Request Titles" section above for detailed scope selection guidance.

**Feature domains (use when applicable):**

- **redteam** - MANDATORY for all redteam-related changes (plugins, strategies, UI, CLI, docs, examples)
- **providers** - Provider implementations (OpenAI, Anthropic, LocalAI, etc.)
- **assertions** - Assertion types and grading
- **eval** or **evaluator** - Core evaluation engine (non-redteam)
- **api** - Public API changes

**Product areas (when not redteam and localized):**

- **webui** - Web interface and viewer (React app)
- **cli** - Command-line interface
- **server** - Web server
- **site** - Documentation site

**Infrastructure:**

- **deps** - Dependencies (or use Dependencies section)
- **ci** - CI/CD pipelines
- **tests** - Test infrastructure
- **build** - Build tooling
- **examples** - Example configurations (non-redteam)

**Specialized:**

- **auth**, **cache**, **config**, **python**, **mcp**, **code-scan** - As needed

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
## Release Process

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases. Release Please automates CHANGELOG generation, version bumps, and GitHub releases based on conventional commits.

### How It Works

1. **Development**: Write code following [conventional commit format](https://www.conventionalcommits.org/) in your commit messages
2. **Release PR**: When changes are merged to main, release-please automatically creates/updates a release PR that:
   - Generates CHANGELOG.md entries from commit messages
   - Determines version bump (major/minor/patch) from commit types
   - Updates the version in package.json
   - Creates a git tag
3. **Publishing**: When the release PR is merged:
   - A GitHub release is created automatically
   - The npm package is published to npm using the NPM_TOKEN secret
   - No manual version bumps or changelog edits needed

### Commit Message Format

Use [conventional commits](https://www.conventionalcommits.org/) format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Common types:**

- `feat:` - New feature (triggers minor version bump)
- `fix:` - Bug fix (triggers patch version bump)
- `feat!:` or `fix!:` - Breaking change (triggers major version bump)
- `chore:` - Maintenance tasks (triggers patch version bump)
- `docs:` - Documentation only (triggers patch version bump)
- `refactor:` - Code refactoring (triggers patch version bump)
- `test:` - Test updates (triggers patch version bump)

**Examples:**

```bash
feat(providers): add support for Claude 3.5
fix(webui): resolve memory leak in eval table
feat(api)!: remove deprecated provider options
chore(deps): update dependencies
```

### Version Bumping

- **Major** (1.0.0 → 2.0.0): Commits with `!` breaking change indicator (e.g., `feat!:`, `fix!:`)
- **Minor** (1.0.0 → 1.1.0): Commits with `feat:` or `feat(`
- **Patch** (1.0.0 → 1.0.1): All other types (`fix:`, `chore:`, `docs:`, `refactor:`, `test:`, etc.)

### Release Steps

The release process is fully automated:

1. Merge PRs to main with conventional commit messages
2. Release-please automatically creates/updates a release PR
3. Review and merge the release PR
4. GitHub release is created and npm package is published automatically

### Configuration Files

- `.release-please-manifest.json` - Tracks the current version
- `release-please-config.json` - Configures release-please behavior
- `.github/workflows/release-please.yml` - Creates/updates release PRs and publishes to npm when merged

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
