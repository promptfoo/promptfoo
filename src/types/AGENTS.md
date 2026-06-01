# Types and Schemas

Public configuration types, environment schemas, provider types, and server/API Zod schemas.

## Public Surface

- Treat changes in `src/types/index.ts`, `src/types/providers.ts`, `src/types/env.ts`, and `src/types/api/` as public contract changes.
- Preserve backwards compatibility unless the user explicitly asks for a breaking change. Prefer optional fields, nullable transforms, and permissive response schemas where existing saved evals or older clients may send older shapes.
- Do not use `any` to hide schema drift. If a schema needs to preserve unknown provider output, prefer `z.unknown()` or a clearly bounded passthrough shape.

## Schema Generation

When changing config, env, provider, or API schemas, check whether generated artifacts and docs need updates:

```bash
npm run jsonSchema:generate
npm run tsc
```

Also inspect affected docs under `site/docs/configuration/`, `site/docs/providers/`, and `site/static/config-schema.json` when relevant.

## API Schemas

Schemas under `src/types/api/` are shared with `src/server/` and the web UI:

- Request schemas should validate before route logic uses the body.
- Response schemas should allow provider/model-specific variable output where needed.
- Keep route and API-schema changes together so server handlers, frontend callers, and tests stay aligned.

## Environment Variables

When adding provider env vars:

- Update `ProviderEnvOverridesSchema` in `src/types/env.ts`.
- Update CLI/env documentation where applicable.
- Regenerate JSON schema.
- Add provider tests for explicit config vs env fallback precedence.
