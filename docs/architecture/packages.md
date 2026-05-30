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

Leaf layers may import only themselves plus external packages. The same
architecture check enforces that rule so this first extracted surface cannot
quietly grow back upward into Node, provider, or redteam code.

## Layer Dependency Ratchet

Each private layer declares its currently allowed dependencies in
`architecture/layers.json`. The current graph still has transitional edges, so
the allowlist records today's honest baseline rather than pretending the final
package topology already exists. New cross-layer relationships fail
`npm run architecture:check` until they are reviewed explicitly.

Mixed modules that do not yet have a stable package owner belong to
`legacy-runtime`. This keeps migration debt visible. New checked source files
must be assigned to a layer instead of silently becoming unclassified.

The checker also resolves cross-layer source aliases such as `@promptfoo/*`.
The browser-only `@app/*` alias stays inside the `app` layer. Alias spelling
does not exempt a browser import from the same layer and path checks as a
relative import.

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
