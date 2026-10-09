# Public Contracts

Portable Zod schemas and types exported through the published `promptfoo/contracts` subpath.

## Rules

- Treat every runtime export here as public API. Preserve backwards compatibility unless the user explicitly asks for a breaking change.
- Keep this layer lightweight and portable: no filesystem, database, server, provider SDK, telemetry, or CLI dependencies.
- Keep `.js` specifiers in `index.ts`; the emitted ESM declarations and runtime imports depend on them.
- Prefer narrow schemas for known portable contracts, with explicit `z.unknown()` / records only where downstream provider or plugin data is intentionally open-ended.
- Keep legacy shims in `src/types/*` and `src/validators/*` equivalent to these exports when moving or changing shared contracts.

## Validation

```bash
npx vitest run test/contracts test/package-manifests.test.ts test/integration/library-exports.integration.test.ts
npm run tsc
npm run test:contracts-isolation
```

If config/env schema output changes, also run `npm run jsonSchema:generate` and check affected docs.

The isolation check copies these sources into a temporary package with only Zod as a
runtime dependency. It builds and tests ESM/CommonJS exports and declarations in
a separate consumer, without root dependencies or path aliases. Source checks use browser
types without Node globals; installed consumers use Node types without DOM globals.
Bare imports stay external so build-tool dependencies cannot hide undeclared runtime dependencies.
No package is published.
