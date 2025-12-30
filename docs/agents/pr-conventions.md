# Pull Request Conventions

PR titles follow Conventional Commits format. They become squash-merge commit messages and changelog entries.

## Format

```plaintext
<type>(<scope>): <description>
<type>(<scope>)!: <description>  # Breaking changes
```

## Types

| Type       | Use For                                               |
| ---------- | ----------------------------------------------------- |
| `feat`     | New feature or capability                             |
| `fix`      | Bug fix in application code                           |
| `chore`    | Maintenance, upgrades, non-breaking refactors         |
| `refactor` | Code refactoring without behavior change              |
| `docs`     | Documentation only                                    |
| `test`     | Test-only changes (new tests, test fixes, test infra) |
| `ci`       | CI/CD changes                                         |
| `revert`   | Revert previous change                                |
| `perf`     | Performance improvement                               |

**Breaking changes:** Add `!` after scope: `feat(api)!:`, `chore(deps)!:`

### Test vs Fix

Use `test:` when the PR **only** contains test changes:

- Adding new tests
- Fixing broken/flaky tests
- Fixing lint errors in test files
- Test infrastructure changes

Use `fix:` when fixing bugs in **application code** (even if tests are included):

- Bug fix in `src/` with accompanying test changes → `fix:`
- Lint error in test file only → `test:`

## Scope Selection (Priority Order)

### 1. Feature Domains (HIGHEST PRIORITY)

**`redteam` - MANDATORY for ALL redteam-related changes:**

- Plugins, strategies, grading
- UI components (setup, report, config dialogs)
- CLI commands, server endpoints
- Documentation, examples
- **ANY change that touches redteam functionality**

**Other feature domains:** `providers`, `assertions`, `eval`/`evaluator`, `api`

### 2. Product Areas

- `webui` - React app in `src/app/`
- `cli` - CLI in `src/`
- `server` - Web server in `src/server/`
- `site` - Documentation site in `site/`

### 3. Technical/Infrastructure

- `deps` - Dependency updates
- `ci` - CI/CD pipelines, GitHub Actions
- `tests` - Test infrastructure
- `build` - Build tooling
- `examples` - Non-redteam examples

### 4. Specialized

`auth`, `cache`, `config`, `python`, `mcp`, `code-scan`

### 5. No Scope

For generic/cross-cutting changes: `chore: bump version 0.119.11`

## THE REDTEAM RULE

**If a PR is redteam-related in ANY way, use `(redteam)` scope. No exceptions.**

This applies even if the change is only in UI, CLI, docs, examples, or server endpoints.

❌ **Wrong:**

```plaintext
fix(webui): fix Basic strategy checkbox in red team setup
feat(cli): add redteam validate command
```

✅ **Correct:**

```plaintext
fix(redteam): fix Basic strategy checkbox in setup UI
feat(redteam): add validate target CLI command
```

**Why?** Redteam spans CLI, webui, server, docs, and examples. Consistent scoping makes it easy to find all redteam work.

## Decision Tree

```plaintext
1. Is this redteam-related? → Use (redteam)
2. Is it another feature domain? → Use that scope
3. Is it localized to one product area? → Use that scope
4. Is it infrastructure? → Use that scope
5. Otherwise → No scope
```

## Dependency Updates

- **`fix(deps)`** - Patch versions (security/bug fixes)
- **`chore(deps)`** - Minor/major upgrades, bulk updates, dev dependencies

## Examples

✅ **Good:**

```plaintext
feat(redteam): add FERPA compliance plugin
fix(providers): support function providers in assertions
feat(webui): add eval results filter permalinking
chore(deps): update Material-UI monorepo to v8 (major)
fix(deps): update dependency better-sqlite3 to v12.4.6
feat(api)!: simplify provider interface
chore: bump version 0.119.11
test: add smoke tests for CLI commands
test(redteam): fix flaky plugin integration tests
```

❌ **Bad:**

```plaintext
feat: add new redteam thing      # Missing (redteam) scope
fix(webui): red team checkbox    # Should be fix(redteam)
chore(webui): update dependency  # Should be chore(deps)
feat: stuff                      # Too vague
fix(test): resolve lint errors   # Should be test: (test-only changes)
```

## Draft Mode Required

**Always open PRs in draft mode.** Use the `--draft` flag:

```bash
gh pr create --draft --title "feat(scope): description"
```

This allows maintainers to review and provide feedback before the PR is marked ready for merge.

## Checklist Before Creating PR

1. Is this redteam-related? → Use `(redteam)` scope
2. Choose correct type
3. Choose correct scope using priority order
4. Breaking change? Add `!` after scope
5. Run `npm run l && npm run f`
6. **Open the PR in draft mode** (`--draft`)
