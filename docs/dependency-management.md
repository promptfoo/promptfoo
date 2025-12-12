# Dependency Management

## Safe Update Workflow

Use `--target minor` for safe updates:

```bash
# Check all workspaces
npx npm-check-updates --target minor              # Root
npx npm-check-updates --target minor --cwd site   # Site
npx npm-check-updates --target minor --cwd src/app # App

# Find example package.json files
find examples -name "package.json" -not -path "*/node_modules/*" -type f

# Apply with -u, then verify
npm run build && npm test && npm run lint && npm run format

# Check version consistency (required by CI)
npx check-dependency-version-consistency
```

## Critical Rules

1. **peerDependencies must match devDependencies** - Prevents "package not found" errors
2. **Update examples/** - 12+ package.json files are user-facing
3. **No package-lock.json** - Project intentionally omits it; `npm audit` won't work
4. **If updates fail** - Revert and keep current version

## Checking Major Updates

```bash
npx npm-check-updates --target latest
```

Major updates often require code changes - evaluate carefully.
