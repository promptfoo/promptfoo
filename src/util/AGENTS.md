# Utility Modules

Shared helpers used across CLI, providers, server, tests, and output generation.

## Rules

- Treat changes as cross-cutting: search call sites before changing behavior, defaults, return shapes, thrown errors, or env-var semantics.
- Prefer existing focused helpers over a new broad utility. Keep helpers small, typed, and colocated with their domain when only one domain uses them.
- Preserve secret hygiene: never log raw headers, API keys, tokens, signed URLs, provider configs, or env values — use the logger's sanitized object context.
- Preserve path safety: use the existing path/file-reference/secure-temp helpers instead of ad hoc joins when user-controlled paths are involved.
- Don't route untrusted runtime data through Nunjucks rendering (`templates.ts`); pass it as data variables. See `src/prompts/AGENTS.md` for the template-injection rules.

## Output and Artifacts

For `output.ts`, `outputFormats.ts`, `exportToFile/`, table conversion, JSON/CSV/JUnit, or redaction:

- Add focused unit coverage for the exact artifact shape.
- Run a real local eval with `--no-cache -o <artifact>` when behavior changes.
- Inspect the exported file for `success`, `score`, `error`, redaction, named metrics, and backwards-compatible fields before claiming it works.

## Fetch, Retry, and Cache

For `fetch/`, retry context, provider response normalization, caching, or token usage:

- Check for existing retry layers before adding another (see also `src/scheduler/AGENTS.md`).
- Keep cache keys free of secrets and stable for semantically equivalent inputs.
- Mock network calls in tests unless the user explicitly asked for a live-provider check.

## Validation

```bash
npx vitest run test/util/<file>.test.ts
npm run tsc
```

For CLI-visible behavior, also run `npm run local -- eval ... --no-cache` from the repo root.
