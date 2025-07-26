# Scripts

This directory contains utility scripts for the Promptfoo project.

## verify-package-integrity.js

This script helps prevent dependency misconfiguration issues like the one in [Issue #4972](https://github.com/promptfoo/promptfoo/issues/4972), where runtime dependencies were incorrectly placed in `devDependencies`.

### What it does

1. **Dependency Placement Check**: Scans all TypeScript files in `src/` to find imports and verifies they're in the correct section of `package.json`
2. **Critical Dependencies Check**: Ensures essential packages (like `@inquirer/*`, `chalk`, `commander`) are in `dependencies`
3. **NPX Installation Test**: Simulates an `npx` installation to ensure the package works correctly

### How to run

```bash
npm run verify:package
```

This script runs automatically:
- On every pull request (via GitHub Actions)
- Before npm releases

### Managing Optional Peer Dependencies

Many packages in Promptfoo are intentionally kept in `devDependencies` because they're optional peer dependencies. Users install only the packages they need based on which providers they use.

These optional packages are listed in `optional-peer-dependencies.json`:

```json
{
  "packages": [
    // Specific packages that are optional
    "@azure/identity",
    "playwright",
    // ... etc
  ],
  "patterns": [
    // Patterns that match multiple packages
    "@adaline/",
    "@aws-sdk/",
    // ... etc
  ]
}
```

#### Adding a new optional peer dependency

If you're adding a new provider that requires optional dependencies:

1. Add the package(s) to `devDependencies` in `package.json`
2. Add them to `optional-peer-dependencies.json`
3. Document the installation requirement in the provider's documentation (e.g., `site/docs/providers/your-provider.md`)

Example documentation:
```markdown
## Installation

This provider requires additional dependencies:

\```bash
npm install @your-org/your-package
\```
```

### Troubleshooting

If the script reports false positives:

1. Check if the package should be an optional peer dependency
2. If yes, add it to `optional-peer-dependencies.json`
3. If no, move it from `devDependencies` to `dependencies` in `package.json` 