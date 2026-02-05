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

3. **Run `npm audit`** - Use `npm audit` or `npm run audit:fix` to check for security vulnerabilities across all workspaces.

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
