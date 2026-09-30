# Installed package fixtures

`scripts/testPackageArtifact.ts` installs packed `promptfoo` in a temporary consumer
outside the repository and copies these fixtures there. Installs use the public npm
registry with lifecycle scripts disabled. Pass `--registry URL` to use a trusted mirror.

After `npm run build`, run from the repository root:

```sh
npm run test:package-artifact
npm run test:package-artifact -- --profile omit-optional
```

Both profiles check ESM/CommonJS evaluations and JSON exports, declaration types,
and web assets. Evaluations cover success, assertion failure, and provider errors
with caching disabled and isolated configuration paths. CommonJS also checks
writable exports and Zod constructor identity.

The default profile checks both CLI aliases and evaluates compressed HTTP responses
from a local server. Without optional dependencies, native SQLite is unavailable;
even `--version` must report the expected missing-dependency diagnostic.

The repository's TypeScript compiler checks callers against the installed declarations.
Contracts use full strict checking. Root API callers use `skipLibCheck` because `Eval`
exposes Drizzle declarations with upstream errors and optional-driver imports.
