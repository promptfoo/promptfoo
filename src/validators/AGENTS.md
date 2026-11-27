# Validators

Zod validators for providers, redteam config, sessions, and legacy contract shims.

## Public Surface

- `prompts.ts` and `shared.ts` are legacy re-export shims for `src/contracts/validators/*`. Read `src/contracts/AGENTS.md`, edit the contract source first, and keep `test/contracts/shimEquivalence.test.ts` passing.
- Provider and redteam schemas are user-facing config contracts. Preserve backward compatibility unless the user explicitly asks for a breaking change.
- Prefer explicit `z.unknown()`, `z.record()`, unions, transforms, or passthrough behavior over `z.any()` when preserving arbitrary provider/plugin config.
- Keep schema defaults/transforms aligned with runtime behavior. If a validator expands aliases, defaults, or collections, test the parsed output, not just parse success.

## Redteam and Session Config

- Redteam plugin/strategy schemas must stay aligned with `src/redteam/constants*`, docs under `site/docs/red-team/`, and generation behavior.
- Session validation touches provider test UX. Preserve actionable error messages and avoid remote calls in schema-only tests.

## Validation

```bash
npx vitest run test/validators test/contracts
npm run tsc
```

If config schema output changes, also run `npm run jsonSchema:generate` and update affected docs.
