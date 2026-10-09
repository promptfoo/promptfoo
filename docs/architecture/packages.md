# Internal Package Boundaries

Promptfoo still publishes one package today, but the repository is beginning to
model the internal boundaries that would support a future multi-package split.

## Current Private Layers

| Layer              | Current roots                                                    | Intended role                                   |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------- |
| `facade`           | `src/index.ts`                                                   | Public compatibility surface                    |
| `contracts`        | `packages/contracts/src`, `src/contracts`, `src/contracts.ts`    | Leaf-safe shared contracts and schemas          |
| `validation`       | `src/validation`                                                 | Portable extension and range validation helpers |
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

`packages/contracts/src` owns the implementation, with compatibility re-exports in
`src/contracts` and the `src/contracts.ts` public entrypoint. The private `@promptfoo-internal/contracts` workspace builds
independently with Zod as its only runtime dependency. The published `promptfoo`
facade bundles its implementation and declarations. It owns this portable subset:

- shared token/input contracts
- portable HTTP and MCP provider configuration schemas
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

`src/validation` contains the file-extension and filter-range helpers used by
configuration schemas, with no Node or package dependencies. The original
`src/util/fileExtensions` and `src/util/filterRange` paths re-export the same
functions and extension array. Range warnings stay in
`src/util/filterRangeWarn.ts`.

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

`src/util/envFile.ts` owns plain `.env` file loading as a Node filesystem adapter.
The imports from `src/envars.ts` and `src/server/server.ts` replace external
`dotenv` calls at the same startup points; the edge baseline records these two
internal dependencies. The loader imports only Node built-ins, so early loading
does not initialize the logger, configuration state, or database. Keeping it
separate from `setupEnv` preserves that initialization order without duplicating
the parser across callers.

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

Browser consumers import result failure reasons from `src/types/results.ts` and
the evaluation page limit from `src/types/evalConstants.ts`. Their legacy barrel
exports remain compatible. History uses the `src/types/standaloneEval.ts` DTO,
and trace views use the existing `TraceSpan` type from `src/types/tracing.ts`,
without importing database or cache implementations. These type-only changes
narrow the source graph; they do not by themselves measure bundle-size savings.

The `app` layer has an additional internal-path allowlist. It pins the existing
browser-to-runtime imports while DTOs and presentation helpers move into a
browser-safe package surface. A new app import from root runtime code fails the
architecture check even when the broader layer relationship already exists.

When moving an existing browser import to a narrower surface, remove its old
path from the allowlist. Avoid adding paths unless the dependency is
intentionally browser-safe. Allowlist entries are exact files, not directory
roots.

## Package Source Coverage

Architecture checks scan `src/`, `packages/`, and every configured layer root.
Assign new package source to a layer in `architecture/layers.json`. The same
import, dependency, and edge-count rules apply to all classified files.
Nested `node_modules`, declaration files, and `packages/**/dist` output are
excluded. Add other generated files or directories to `ignoredRoots`.

When moving a layer into a private workspace, include its implementation root
and compatibility shims in that layer. An exact source alias such as
`"@promptfoo/contracts": "packages/contracts/src"` takes precedence over the
broader `@promptfoo` alias. Architecture aliases do not configure the compiler,
bundler, or package exports.

Tracked TypeScript files under `packages/` or other configured product roots
must belong to the root compiler project unless a package project owns them.
Reference separate package projects from the root `tsconfig.json`; the check
also follows solution references. The nearest referenced package project owns
files below its directory, even if a parent project also includes them. Projects
in the same directory combine their file lists. A package project cannot cover
files outside its own directory.

The coverage check validates compiler configuration and tracked-file membership.
It does not typecheck package source. When extracting a package, add its actual
typecheck and artifact consumer checks to CI.

```bash
npm run check:typescript-coverage
npm run tsc
```

## Shared presentation helpers

`src/presentation` contains table conversion, report metrics, and configuration
formatting used by the UI and Node. Browser code imports these modules directly.
The former paths in `src/util` and `src/redteam` preserve the same exports for
existing Node and cloud consumers.

These modules remain in the `legacy-runtime` layer because they depend on the
transitional configuration and result types. Table conversion still updates
result variables and uses the logger; Vite provides the browser logger and hash
implementations.

## Dependency Ownership Report

The dependency report groups root runtime dependencies by the private layer that
currently uses them. Source files beneath a separate `package.json` belong to
that package and are excluded from the root summary:

```bash
npm run deps:ownership
```

It includes direct, optional, and peer dependency declarations. Peers marked
optional in `peerDependenciesMeta` appear as `optional-peer`; other peers appear
as `peer`. These labels describe the package contract, not what is installed.

The report also checks each workspace and the standalone code-scan action against
its own manifest. It records source, build, test, and type references, including
any declarations already emitted into `dist`. Run a build first when auditing
those generated declarations.

```bash
npm run deps:ownership -- --json
npm run deps:ownership -- --check
```

`--json` includes file and line references, scan coverage, and annotations from
`architecture/dependency-ownership.json`. `--check` fails on undeclared imports,
root runtime imports declared only for development, or packages without an
assigned owner. Invalid annotations fail either mode. Keep annotations tied to
specific files that explain computed imports, build-only usage, or installed
assets; an unreferenced declaration alone is not evidence that it can be removed.

## Architecture Reports

The checker can report references, cycles, and files reachable from an entrypoint:

```bash
npm run architecture:check -- --report
npx tsx scripts/checkArchitectureBoundaries.ts --json > architecture-report.json
npx tsx scripts/checkArchitectureBoundaries.ts --json --entrypoint=src/contracts.ts
```

JSON goes to stdout and check diagnostics go to stderr. Failed checks still return
a nonzero exit status. Reports preserve the existing boundary limits: enforcement
counts all literal references together and excludes imports from the public facade.

Reports separate explicit type references, value references, dynamic imports, and
`require.resolve` calls. Mixed imports count as value references. Entrypoint reports
include the facade and compare all references, value references alone, and value
references plus dynamic imports. External specifiers name direct source references.

Unresolved internal references, computed loaders, and references to ignored or
declaration files include source locations. Implementation files take precedence
over declaration fallbacks. The scanner recognizes single-argument `require()` and
`require.resolve()` calls, including calls inside functions. It does not follow
aliased loaders, computed member access, resolution options, or runtime bindings.

These source graphs do not account for compiler import removal, Vite substitutions,
tree shaking, or transitive installed dependencies. Layer cycles and file cycles
are reported separately. Back-edges show violations of the configured layer order;
they do not measure the work needed to remove cycles.
