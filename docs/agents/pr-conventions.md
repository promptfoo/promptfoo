# Pull Request Conventions

PR titles follow Conventional Commits format. They become squash-merge commit messages and changelog entries.

## Format

```plaintext
<type>(<scope>): <description>
<type>(<scope>)!: <description>  # Breaking changes
```

### Description Guidelines

- **Imperative mood**: "add feature" not "added" or "adds"
- **Lowercase**: except proper nouns and acronyms (FERPA, OAuth, MUI)
- **No trailing period**
- **Be specific**: describe what changed, not that something changed
- **~50 characters**: GitHub truncates long titles

## Types

| Type       | Use For                                               |
| ---------- | ----------------------------------------------------- |
| `feat`     | New CLI feature or major webui feature                |
| `fix`      | Bug fix in CLI or major webui bug fix                 |
| `chore`    | Maintenance, upgrades, minor fixes, non-user-facing   |
| `refactor` | Code restructuring without behavior change            |
| `docs`     | Documentation only (use with `site` scope for site/)  |
| `test`     | Test-only changes (new tests, test fixes, test infra) |
| `ci`       | CI/CD changes                                         |
| `revert`   | Revert previous change                                |
| `perf`     | Performance improvement                               |

**Changelog visibility:** Only `feat`, `fix`, and breaking changes (`!`) appear in release notes. Use `ci`, `chore`, `test`, `docs`, or `refactor` for changes that shouldn't be user-facing.

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

### Type Selection for Mixed Changes

Use the **primary change** to determine type:

| PR Contains                       | Type       | Why                              |
| --------------------------------- | ---------- | -------------------------------- |
| Bug fix + new tests               | `fix`      | Fix is primary, tests support it |
| Feature + documentation           | `feat`     | Feature is primary               |
| Only test changes                 | `test`     | No application code changed      |
| Only doc changes                  | `docs`     | No application code changed      |
| Minor webui fix (styling, typos)  | `chore`    | Not a major user-facing fix      |
| Refactor + minor fixes discovered | `refactor` | Refactor was the intent          |

**Major webui changes** = new pages, significant UX changes, core functionality bugs

**Minor webui changes** = styling tweaks, copy changes, internal refactors → use `chore`

## Scope Selection (Priority Order)

### 1. Feature Domains (HIGHEST PRIORITY)

**`redteam` - MANDATORY when redteam is the PR's primary change or product surface:**

- Plugins, strategies, grading
- UI components (setup, report, config dialogs)
- CLI commands, server endpoints
- Documentation, examples
- Redteam-specific tests, fixtures, utilities, and behavior changes

**Other feature domains:** `providers`, `assertions`, `eval`, `api`, `db`

### 2. Product Areas

- `webui` - React app in `src/app/`
- `cli` - CLI in `src/`
- `server` - Web server in `src/server/`

**Note:** Documentation site changes use `docs(site):`, not a standalone `site` scope.

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

**If a PR is primarily redteam-related, use `(redteam)` scope.**

This applies even if the redteam change is only in UI, CLI, docs, examples, utilities, tests, or server endpoints.

For broad, cross-cutting maintenance PRs, do **not** choose `(redteam)` solely because one touched file lives under `src/redteam/` or because one generic helper is also used by redteam. Use the PR's primary purpose/scope and call out the redteam-adjacent touch in the PR description when it is review-relevant.

❌ **Wrong:**

```plaintext
fix(webui): fix Basic strategy checkbox in red team setup
feat(cli): add redteam validate command
chore(redteam): resolve repo-wide lint findings
```

✅ **Correct:**

```plaintext
fix(redteam): fix Basic strategy checkbox in setup UI
feat(redteam): add validate target CLI command
chore: resolve repo-wide lint findings
```

**Why?** Redteam spans CLI, webui, server, docs, and examples. Consistent scoping makes it easy to find all redteam work.

## Decision Tree

```plaintext
1. Is the PR primarily redteam-related? → Use (redteam)
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
feat(cli): add --json output flag to eval command
fix(cli): handle empty config file gracefully
fix(webui): fix pagination crash on empty results
chore(webui): update button styling on settings page
docs(site): add guide for custom providers
chore(deps): update Material-UI monorepo to v8 (major)
fix(deps): update dependency better-sqlite3 to v12.4.6
feat(api)!: simplify provider interface
chore: bump version 0.119.11
test: add smoke tests for CLI commands
test(redteam): fix flaky plugin integration tests
```

❌ **Bad:**

```plaintext
feat: add new redteam thing         # Missing (redteam) scope
fix(webui): red team checkbox       # Should be fix(redteam)
chore(webui): update dependency     # Should be chore(deps)
feat: stuff                         # Too vague
fix: bug fix                        # What bug? Be specific
Fix(cli): Add feature               # Wrong case, not imperative
fix(test): resolve lint errors      # Should be test: (test-only)
docs: update site                   # Should be docs(site):
site: update guides                 # Should be docs(site):
feat(webui): minor styling update   # Minor = chore, not feat
```

## Draft vs Ready

Open PRs **ready for review** by default:

```bash
gh pr create --title "feat(scope): description" --body "..."
```

Use `--draft` only when:

- The user explicitly asks for a draft
- The work is an intentional WIP parked for a hand-off
- The PR blocks on an external dependency that must land first
- The PR addresses an unpublished security advisory (see root `AGENTS.md`
  "Security-Sensitive PRs")

## Commit & PR Attribution

- **Never attribute commits or PR bodies to Claude / Claude Code.** Do not add
  `Co-Authored-By: Claude…` trailers, "Generated with Claude Code" footers, or
  similar markers. Use your configured git identity only.
- Do not add marketing-style suffixes to commit subjects.

## GitHub Interaction Rules

- **NEVER comment on GitHub issues** - Only create PRs to address issues
- **NEVER close issues** - Let maintainers close issues after PR merge
- Focus on creating high-quality PRs that fully address the issue

## Checklist Before Creating PR

1. Is this PR primarily redteam-related? → Use `(redteam)` scope
2. Choose correct type
3. Choose correct scope using priority order
4. Breaking change? Add `!` after scope
5. Run `npm run l && npm run f`
6. Open ready-for-review (omit `--draft`) unless one of the exceptions above applies
7. Do **not** add Claude attribution trailers or footers
