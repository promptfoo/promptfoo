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

## MCP Authentication Contracts

`promptfoo/contracts` exports `McpAuthInputSchema`, `McpAuthSchema`,
`McpAuthInputJsonSchema`, and the inferred `McpAuthInput` / `McpAuthParsed` types.
These cover MCP authentication, including the auth forms shared by A2A. HTTP
authentication and complete provider configurations have separate semantics and
are not covered by these schemas.

```typescript
import { z } from 'zod';
import { McpAuthInputSchema, McpAuthSchema } from 'promptfoo/contracts';

const RequestSchema = z.object({ auth: McpAuthInputSchema.optional() });
const request = RequestSchema.parse(input);
const auth = McpAuthSchema.optional().parse(request.auth);
```

The input schema leaves an omitted OAuth grant unset and preserves explicit
no-auth tags. The runtime schema defaults the grant to `client_credentials` and
maps no-auth tags to `undefined`. Both retain existing unknown-property stripping;
do not use their parsed output as a lossless round trip for stored configuration.
Neither schema renders templates, resolves credentials, reads files, discovers
OAuth endpoints, or makes requests. Scope strings remain strings until runtime
rendering and normalization.

API-key authentication is a union requiring either a nonempty `value` or a
nonempty legacy `api_key`. Both may be present; runtime keeps its existing
`value || api_key` precedence. The union exports this requirement directly as
JSON Schema without a custom refinement or export override. An empty alias is
allowed when the other alias supplies a key. Placement and header-name defaults
remain in the runtime auth helpers.

`McpAuthInputJsonSchema` describes input acceptance using JSON Schema draft-07.
It does not perform Zod stripping or runtime normalization. Generate other
supported dialects from `McpAuthInputSchema` with Zod's `toJSONSchema` input mode.
Compose schemas with compatible Zod versions; consumers with incompatible Zod
installations can call `.safeParse()` separately without composing schema objects.
The older `src/providers/mcp/auth` imports remain available. Its `ApiKeyAuthSchema`
is now a union; object-specific methods such as `.shape` are not available on it,
and invalid credentials produce union issues rather than a refinement issue.

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
