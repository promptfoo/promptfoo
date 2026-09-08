# Installed package fixtures

`scripts/testPackageArtifact.ts` copies these scripts into a temporary consumer
outside the repository, installs a packed `promptfoo`, and runs its public API.
The consumer uses the public npm registry and is isolated from the repository's
workspaces, lockfile, overrides, and development dependencies. To select a trusted
local mirror explicitly, pass `--registry https://your-registry.example/`.

After `npm run build`, run from the repository root:

```sh
npm run test:package-artifact
npm run test:package-artifact -- --profile omit-optional
```

Both dependency profiles disable install scripts. They verify ESM/CommonJS root
API evaluations, root and contracts declarations, and web asset references.
The CommonJS fixture checks writable exports and the identity of its native Zod
constructors. API fixtures check a pass, an assertion failure, and a provider
error with caching disabled and isolated configuration paths. Default dependency
resolution also runs the installed CLI against a local compressed HTTP server.
Default CLI version aliases must report the installed version. The
optional-omitted profile intentionally lacks native SQLite platform packages and
checks the existing actionable CLI failure (even `--version` initializes SQLite).
It cannot run persistence-dependent CLI evaluations.

The TypeScript compiler is a test tool from the repository; its consumer projects
resolve all package declarations from the isolated installation with strict
checking enabled for consumer code. Contracts also check dependency declarations;
root API consumers use `skipLibCheck` because the public `Eval` surface currently
exposes Drizzle declarations with upstream errors and unrelated optional driver
imports. This does not claim a clean root declaration closure.
