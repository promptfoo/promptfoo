# Private Contracts Workspace

This private package owns the portable implementation behind `promptfoo/contracts`.
Read the root `AGENTS.md` and keep the installed full facade working.

- Edit schemas and types in `src/` here. Preserve the relative `.js` compatibility
  re-exports under the repository's `src/contracts/`, `src/types/`, and
  `src/validators/` paths.
- Preserve public runtime exports, types, serialized values, schema transforms,
  and object identity. Keep the trace endpoint matcher out of the public barrel.
- Keep the source graph inside this workspace with only Zod as an external
  dependency. Do not import Node, providers, storage, telemetry, CLI, or root code.
- Keep `.js` specifiers on relative source imports and exports so ESM declarations
  resolve after installation. Preserve both ESM and CommonJS declarations.
- Do not publish this package or add a private runtime dependency to the full
  facade. The root bundle includes this source and declares Zod itself.

Run from the repository root:

```sh
npx vitest run test/contracts test/package-manifests.test.ts
npm run tsc
npm run test:contracts-workspace
npm run build
npm run test:package-artifact
```

Regenerate configuration schemas when env/schema output changes, as described in
`src/types/AGENTS.md`.
