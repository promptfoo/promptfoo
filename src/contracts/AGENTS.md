# Public Contracts

Compatibility paths for portable Zod schemas and types exported through the published
`promptfoo/contracts` subpath. Implementations live in `packages/contracts/src`; keep
these relative `.js` re-exports so existing source consumers keep working.

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
```

If config/env schema output changes, also run `npm run jsonSchema:generate` and check affected docs.
