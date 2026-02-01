# Dependency Management

## Safe Update Workflow

Use `--target minor` for safe minor/patch updates only:

```bash
# Check all three workspaces
npx npm-check-updates --target minor              # Root
npx npm-check-updates --target minor --cwd site   # Site
npx npm-check-updates --target minor --cwd src/app # App

# Find example package.json files
find examples -name "package.json" -not -path "*/node_modules/*" -type f

# Apply updates with -u flag
npx npm-check-updates --target minor -u
npx npm-check-updates --target minor -u --cwd site
npx npm-check-updates --target minor -u --cwd src/app

# Verify updates work
npm install
npm run build && npm test && npm run lint && npm run format

# Check version consistency (required by CI)
npx check-dependency-version-consistency
```

## Critical Rules

1. **PeerDependencies must match devDependencies** - Prevents "package not found" errors for users

2. **Update examples/** - 20+ package.json files are user-facing; keep them current

3. **Run `npm audit`** - Use `npm audit` or `npm run audit:fix` to check for security vulnerabilities

4. **If updates fail** - Revert problematic package and keep current version

## Major Updates

```bash
# See available major updates (don't apply automatically)
npx npm-check-updates --target latest

# Major updates often require code changes - evaluate each carefully
```

## Workspaces

The project uses npm workspaces. Updates must be checked in all three locations:

- Root (`/`)
- Site (`/site`) - workspace
- App (`/src/app`) - workspace
