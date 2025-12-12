# Pull Request Conventions

PR titles follow Conventional Commits format. They become squash-merge commit messages and changelog entries.

## Format

```
<type>(<scope>): <description>
<type>(<scope>)!: <description>  # Breaking changes
```

## Types

- `feat` - New feature
- `fix` - Bug fix
- `chore` - Maintenance, upgrades, refactors
- `docs` - Documentation only
- `test` - Test changes
- `refactor` - Code change without behavior change
- `ci` - CI/CD changes
- `perf` - Performance improvement

Breaking changes: Add `!` after scope (e.g., `feat(api)!:`)

## Scope Selection (Priority Order)

### 1. Feature Domains (Highest Priority)

**`redteam` - MANDATORY for ALL redteam-related changes**, including:

- Plugins, strategies, grading
- UI components (setup, report, dialogs)
- CLI commands, server endpoints
- Documentation, examples

Other feature domains: `providers`, `assertions`, `eval`, `api`

### 2. Product Areas

`webui`, `cli`, `server`, `site`

### 3. Infrastructure

`deps`, `ci`, `tests`, `build`, `examples`

### 4. No Scope

Generic changes: `chore: bump version`

## The Redteam Rule

**If a PR touches redteam in ANY way, use `(redteam)` scope. No exceptions.**

Even if only in UI, CLI, docs, or examples - still use `(redteam)`.

## Examples

**Good:**

```
feat(redteam): add FERPA compliance plugin
fix(redteam): fix Basic strategy checkbox in setup UI
feat(providers): add Gemini 3 Pro support
fix(assertions): use script output for file:// references
chore(deps): update Material-UI to v8
docs(site): add Portkey integration guide
```

**Bad:**

```
feat: add new redteam thing        # Missing (redteam) scope
fix(webui): red team checkbox      # Should be fix(redteam)
chore(webui): update dependency    # Should be chore(deps)
```

## Dependency Updates

- `fix(deps)` - Patch versions (security/bug fixes)
- `chore(deps)` - Minor/major upgrades, dev dependencies

## Checklist

1. Is this redteam-related? Use `(redteam)`
2. Choose type: feat/fix/chore/docs/test/refactor/ci/perf
3. Pick scope by priority order above
4. Breaking change? Add `!`
5. Run `npm run l && npm run f` before committing
