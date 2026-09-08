# Private contracts workspace

This workspace owns the portable schemas, types, and input helpers behind
`promptfoo/contracts`. It is private and must not be published. Its only runtime
dependency is Zod; it must not import the root application, Node builtins, provider
SDKs, storage, telemetry, or CLI policy.

`src/contracts/**` in the root package remains a compatibility surface for existing
source consumers, including cloud consumers. Those files re-export this workspace
using relative `.js` paths. The root build follows those imports and bundles the
implementation and declarations into the full `promptfoo` artifact, leaving Zod
as a declared root runtime dependency. No private package installation is required
by users of `promptfoo/contracts`.

The private package name uses `@promptfoo-internal` because existing `@promptfoo/*`
aliases resolve to root source files. Internal imports should use the owning
module directly; do not add unrelated helpers to the public contracts barrel.
The trace endpoint regular expression remains available only through its existing
deep source path.

The architecture scanner classifies `packages/contracts/src` as the contracts
leaf. Its `tsdown.config.ts` is build tooling and is excluded from the runtime
source graph; the root TypeScript project still checks it.

## Validation

From the repository root:

```sh
npm run build --workspace @promptfoo-internal/contracts
npm run typecheck --workspace @promptfoo-internal/contracts
npm run test:contracts-workspace
npx vitest run test/contracts
npm run build
npm run test:package-artifact
```

The standalone test copies only this workspace's declared build inputs outside
the repository, installs its declared dependencies, builds both formats, and
installs its tarball in a second consumer. That consumer checks ESM/CommonJS
runtime behavior and mode-specific TypeScript declarations without repository
aliases or hoisted dependencies. The full-package artifact test separately proves
that the public facade remains installable. This pilot establishes ownership and
isolation; it does not claim a smaller full `promptfoo` installation.
