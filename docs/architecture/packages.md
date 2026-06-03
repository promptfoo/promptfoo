# Internal Package Boundaries

Promptfoo still publishes one package today, but the repository is beginning to
model the internal boundaries that would support a future multi-package split.

## Current Private Layers

| Layer              | Current roots                                                    | Intended role                                   |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------- |
| `facade`           | `src/index.ts`                                                   | Public compatibility surface                    |
| `contracts`        | `src/contracts`, `src/contracts.ts`                              | Leaf-safe shared contracts and schemas          |
| `legacy-contracts` | `src/types`, `src/validators`                                    | Transitional mixed runtime types and validators |
| `core`             | assertions, matchers, prompts, scheduler, test-case logic        | Evaluation domain logic                         |
| `node`             | database, models, config, storage, `src/evaluate.ts`, `src/node` | Node runtime adapters                           |
| `providers`        | `src/providers`                                                  | Concrete provider implementations               |
| `redteam`          | `src/redteam`                                                    | Red-team workflows                              |
| `view-server`      | `src/server`                                                     | Local server and API routes                     |
| `cli`              | `src/main.ts`, `src/commands`                                    | Command-line orchestration                      |
| `app`              | `src/app`                                                        | Browser UI and build configuration              |
| `legacy-runtime`   | Mixed top-level runtime modules                                  | Transitional modules awaiting narrower owners   |

The source of truth for these temporary private layers is
`architecture/layers.json`.

## First Enforced Rule

Internal modules must not import `src/index.ts`.

`src/index.ts` is the public facade. Importing it from inside the product makes
the dependency graph point inward through the public API, which makes later
package extraction harder and can hide cycles.

Run the check with:

```bash
npm run architecture:check
```

## First Leaf Layer

`src/contracts` and its `src/contracts.ts` public entrypoint are the first intentionally
leaf-safe surface. They currently own the dependency-free-or-`zod` subset that can plausibly become a future
`@promptfoo/schema` package:

- shared token/input contracts
- browser-safe common and user API DTOs
- portable blob references and provider-neutral capability/result contracts
- provider environment override schema
- prompt contracts and prompt validation
- transform contracts and shared transform validation

The older `src/types` and `src/validators` paths remain as compatibility shims or
mixed transitional modules. They are useful public/internal surfaces today, but
they are not yet clean enough to call a package boundary.

Leaf layers may import only themselves plus the external packages on their
`allowedExternal` allowlist in `architecture/layers.json` (`contracts` allows only
`zod`). The same architecture check enforces both halves of the rule, so this first
extracted surface can neither grow back upward into Node, provider, or redteam code,
nor quietly pick up a new npm dependency or Node builtin such as `node:fs`. A
`node:` prefix is ignored when matching, so `"fs"` and `"node:fs"` are equivalent.

## Layer Dependency Ratchet

Each private layer declares its currently allowed dependencies in
`architecture/layers.json`. The current graph still has transitional edges, so
the allowlist records today's honest baseline rather than pretending the final
package topology already exists. New cross-layer relationships fail
`npm run architecture:check` until they are reviewed explicitly.

Mixed modules that do not yet have a stable package owner belong to
`legacy-runtime`. This keeps migration debt visible. New checked source files
must be assigned to a layer instead of silently becoming unclassified.

`src/evaluator/runtime.ts` defines the evaluator's narrow runtime port. The
`EvaluationStore` contract owns result append/read, prompt updates, resume lookup,
comparison-result saves, and final evaluation persistence. The default
`src/node/evaluationStore.ts` adapter maps that port to the existing `Eval` and
`EvalResult` models, while `src/evaluator/inMemoryStore.ts` provides a
dependency-light state implementation for embedded evaluators and focused tests.
`src/node/evaluatorRuntime.ts` continues to own JSONL writer construction and
resume append behavior. The evaluator orchestrates evaluation behavior without
importing the concrete `Eval` model.

Assertion dispatch follows the same composition pattern. `src/assertions/registry.ts`
defines a dependency-free generic registry, while `src/assertions/pure.ts`
provides a host-free runner and registry for deterministic assertions without
loading providers, redteam, tracing, scripts, Node adapters, Node builtins, or
external packages. The pure runner accepts already-rendered values; templating,
transforms, and host context remain responsibilities of the compatibility
runner. The dependency-oriented capability packs under
`src/assertions/packs/` own model-graded, script, trace, optional-format,
provider-runtime, webhook, and redteam handlers.
`src/assertions/defaultRegistry.ts` composes every pack for the existing
`runAssertion()` and `runAssertions()` compatibility APIs, which also accept an
injected registry for focused tests and custom host compositions.

Provider families follow an ordered plugin contract before they become separate
packages. The `promptfoo/provider-plugin` subpath is the package-neutral consumer
surface for the versioned manifest, registry, registration, and typed load-error
contracts. `src/providers/pluginRegistry.ts` owns deterministic first-match
registration, lazy loading, disposal, and typed load errors. The full Promptfoo
composition root keeps the built-in AWS, Google, and redteam manifests host-local and
ahead of process-wide external registrations, while `src/providers/registry.ts` remains
the legacy fallback map. This prevents an ESM host from loading a built-in family through
the CommonJS host bundle, or vice versa. Plugin load-error constructors are process-shared
so typed errors remain recognizable when both package formats are loaded. A claiming
manifest must return a factory that matches the requested provider ID; matching plugin
factories then run ahead of the fallback so broad file-provider matching cannot intercept
that ID. Provider plugins may depend on provider contracts, but not the CLI, server, root
facade, or full-package built-in composition.

This V1 surface makes provider composition and artifact testing possible, but it is
not yet the final ABI for independently published provider packages. Its factory
types still use transitional provider contracts from `src/types/providers.ts`.
Those contracts must move to a narrower portable surface before extracting a real
`@promptfoo/provider-*` package.

`architecture/package-candidates.json` defines the package surfaces being prepared
before any new package is published. Each candidate declares its source entrypoint,
optional existing public subpath, allowed runtime npm dependencies, allowed Node
builtins, and maximum runtime source closure. Public candidates also declare their
emitted ESM/CommonJS entrypoints plus installed artifact file and byte budgets.
`npm run package:check` enforces the source budgets and prints the current closure for
every candidate. `npm run architecture:report` emits the same package data plus
source-file, cross-layer-edge, back-edge, and strongly-connected-component totals as
JSON.

The package artifact harness reads the same candidate manifest and verifies every
existing public candidate through clean ESM, CommonJS, and TypeScript consumers. It
also follows each installed candidate entrypoint's emitted runtime chunks and enforces
its dependency, Node builtin, file count, and byte budgets. Public ESM and CommonJS
entrypoints must expose the same external dependency and builtin closure. This
installed-artifact view is authoritative because bundling and tree-shaking can make it
differ from the source ownership closure. Non-literal dynamic imports remain a
residual risk and need semantic clean-consumer coverage.

The harness accepts `--tarball <path>` so CI and every npm release path can build once,
pack once, test that exact tarball, and publish the already-verified artifact.
Candidate entries without a public subpath, such as the pure assertion runtime, are
measured but remain unpublished.

The checker also resolves cross-layer source aliases such as `@promptfoo/*`.
The browser-only `@app/*` alias stays inside the `app` layer. Alias spelling
does not exempt a browser import from the same layer and path checks as a
relative import.

## DAG Progress Ratchets

The architecture check also measures the layer dependency graph so it can move
toward a directed acyclic graph without regressing:

- `maxStronglyConnectedComponentSize` limits the size of the largest remaining
  layer cycle.
- `architecture/edge-baseline.json` limits every existing cross-layer edge to
  its reviewed import count and rejects new edges.
- `forbiddenDependencies` permanently locks layer pairs whose direct or
  transitive dependency has been removed.
- `tierOrder` lists every layer in the intended bottom-to-top topology so the
  checker can report the remaining back-edges.

After intentionally reducing or otherwise reviewing cross-layer coupling, run
`npm run architecture:baseline` and include the baseline change in review. Do
not refresh the baseline merely to make a newly introduced dependency pass.

## Browser Import Ratchet

The `app` layer has an additional internal-path allowlist. It pins the existing
browser-to-runtime imports while DTOs and presentation helpers move into a
browser-safe package surface. A new app import from root runtime code fails the
architecture check even when the broader layer relationship already exists.

When moving an existing browser import to a narrower surface, remove its old
path from the allowlist. Avoid adding paths unless the dependency is
intentionally browser-safe. Allowlist entries are exact files, not directory
roots.

## Dependency Ownership Report

The dependency report groups direct runtime imports by the private layer that
currently uses them:

```bash
npm run deps:ownership
```

The report is intentionally descriptive for now. It gives us the evidence needed
to move dependencies into future packages without guessing at ownership.
