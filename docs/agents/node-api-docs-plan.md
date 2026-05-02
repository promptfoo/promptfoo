# Node API Documentation Plan

## Goal

Turn the existing Node package docs into a clear, maintainable Node.js API
experience that distinguishes supported public APIs from internal helpers and
keeps reference material aligned with the code.

## Checklist

- [x] Define the supported root Node API surface and add source-level stability
      annotations for the exports we intend to document.
- [ ] Reshape the existing Node package guide into a concise Node.js API overview
      with clear next steps for advanced users.
- [x] Add generated API reference docs from the public package entrypoint rather
      than hand-maintaining a large mirror of the source.
- [ ] Link the Node.js API docs from the nearby docs surfaces where users already
      encounter programmatic features.
- [x] Add docs validation so generated/reference docs drift is caught in CI.
- [ ] Run focused QA after each stage, including docs builds and PR-style review
      passes on each commit.

## Working Notes

- Treat `package.json` `exports` plus `src/index.ts` as the canonical public API
  boundary unless we deliberately decide to expand it.
- Preserve useful Node-specific guidance already present in the docs, especially
  function-valued transforms and serialization caveats.
- Avoid promoting deep source exports solely because they are reachable in the
  repository. Documentation should follow an intentional support decision.
