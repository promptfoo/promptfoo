# Types and Schemas

Public configuration types, provider types, and server/API Zod schemas. `src/types/env.ts` only re-exports `src/contracts/env.ts`; the published `promptfoo/contracts` subpath is the real public boundary, so edit env/contract schemas in `src/contracts/` and let `src/types/` re-export them.

## Public Surface

- Treat changes in `src/contracts/`, `src/types/index.ts`, `src/types/providers.ts`, and `src/types/api/` as public-contract changes.
- Preserve backwards compatibility unless the user explicitly asks for a break. Prefer optional fields, nullable transforms, and permissive response schemas — older saved evals and clients still send older shapes.
- Don't use `any` to hide schema drift. To preserve unknown provider output, use `z.unknown()` or a bounded passthrough, not `any`.

## Schema Generation

Config/env/provider/API schema changes can require regenerating artifacts and docs:

```bash
npm run jsonSchema:generate   # regenerates site/static/config-schema.json
npm run tsc
```

Check affected docs under `site/docs/configuration/` and `site/docs/providers/`.

## API Schemas (`src/types/api/`)

Shared with `src/server/` and the web UI:

- Validate request schemas before route logic touches the body.
- Allow provider/model-specific variable output in response schemas where needed.
- Keep route and schema changes together so handlers, frontend callers, and tests stay aligned.

## Provider Env Vars

When adding a provider env var:

- Add it to `ProviderEnvOverridesSchema` in `src/contracts/env.ts` (re-exported via `src/types/env.ts`).
- Regenerate the JSON schema and update CLI/env docs.
- Add tests covering explicit config vs env-fallback precedence.
