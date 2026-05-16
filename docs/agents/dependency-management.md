# Dependency Management

## Safe Update Workflow

Use `--target minor` for safe minor/patch updates only:

```bash
# Check all three locations for available updates
npx npm-check-updates --target minor              # Root
npx npm-check-updates --target minor --cwd site   # Site workspace
npx npm-check-updates --target minor --cwd src/app # App workspace

# Apply updates with -u flag
npx npm-check-updates --target minor -u
npx npm-check-updates --target minor -u --cwd site
npx npm-check-updates --target minor -u --cwd src/app

# Install and verify
npm install
npm run build && npm test && npm run lint && npm run format:check

# Check version consistency (required by CI)
npx check-dependency-version-consistency
```

## Critical Rules

1. **Version consistency across workspaces** - All workspaces must use the same version of shared dependencies. CI enforces this via `check-dependency-version-consistency`.

2. **Update examples/** - 20+ package.json files in examples/ are user-facing; keep them current when updating dependencies.

3. **Run `npm audit`** - Use `npm audit` or `npm run audit:fix` to check for security vulnerabilities across all workspaces. Do not let `npm audit fix` lockfile drift ride along with an unrelated change; ship audit-driven updates as their own PR.

4. **If updates fail** - Revert the problematic package and keep the current version. Don't force incompatible updates.

5. **Test before committing** - Always run `npm run build && npm test` after updating dependencies.

## Major Updates

```bash
# See available major updates (don't apply automatically)
npx npm-check-updates --target latest

# Major updates often require code changes - evaluate each carefully
```

Major updates require careful evaluation:

- Check the changelog for breaking changes
- Look for migration guides
- Test thoroughly before merging

## Workspaces

The project uses npm workspaces. Updates must be checked in all three locations:

- Root (`/`) - Core library dependencies
- Site (`/site`) - Documentation site (Docusaurus)
- App (`/src/app`) - Web UI (React/Vite)

## Working on Renovate Branches

Renovate force-pushes its branches whenever `main` changes or someone comments
`@renovate rebase`. Any manual commit you add may be overwritten without warning.

- Push fixes quickly and expect them to survive only until the next Renovate rebase.
- For non-trivial manual work on a Renovate-managed dependency, create a sibling
  branch off the Renovate branch and open a separate PR that Renovate will not touch.
- On a major-version Renovate PR, read the upstream changelog, run gap analysis on
  our matching provider/integration and its docs, then test end-to-end with real evals
  (`npm run local -- eval -c <example>.yaml --no-cache -o output.json`, adding
  `--env-file .env` when credentials are needed and the file exists)
  before deciding whether the upgrade needs code changes.

## Useful Commands

```bash
# Fix security vulnerabilities in all workspaces
npm run audit:fix

# Check for outdated packages
npm outdated

# See why a package is installed
npm explain <package-name>

# Check for unused dependencies
npm run depcheck
```
