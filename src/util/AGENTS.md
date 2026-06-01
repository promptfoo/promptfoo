# Utility Modules

Shared helpers used across CLI, providers, server, tests, and output generation.

## Rules

- Treat changes here as cross-cutting. Search call sites before changing behavior, defaults, return shapes, thrown errors, or environment-variable semantics.
- Prefer existing focused helpers over adding a broad utility. Keep helpers small, typed, and colocated with the domain when only one domain uses them.
- Preserve secret hygiene. Do not log raw headers, API keys, tokens, signed URLs, provider configs, or environment values; use the logger's sanitized object context.
- Preserve path safety for file helpers. Use existing path, file-reference, and secure-temp helpers instead of ad hoc path joins when user-controlled paths are involved.
- Do not route untrusted runtime data through template rendering. Trusted templates come from config, prompt files, or rubric/config fields; model output, provider output, remote content, and test data should be passed as data variables and remain literal.

## Output and Artifacts

For changes under `output.ts`, `outputFormats.ts`, `exportToFile/`, table conversion, JSON/CSV/JUnit, or redaction:

- Add focused unit coverage for the exact artifact shape.
- Run a real local eval with `--no-cache -o <artifact>` when behavior changes.
- Inspect the exported file for `success`, `score`, `error`, redaction, named metrics, and backwards-compatible fields before claiming the workflow works.

## Fetch, Retry, and Cache

For changes under `fetch/`, retry context, provider response normalization, caching, or token usage:

- Check for multiple retry layers before adding another retry path.
- Keep cache keys free of secrets and stable for semantically equivalent inputs.
- Mock network calls in tests unless the user explicitly asked for a live-provider check.

## Validation

Run the narrowest relevant tests first, then broaden based on blast radius:

```bash
npx vitest run test/util/<file>.test.ts
npm run tsc
```

For CLI-visible behavior, also run `npm run local -- eval ... --no-cache` from the repo root.
