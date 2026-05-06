# Internal Package Boundaries

Promptfoo still publishes one package today, but the repository is beginning to
model the internal boundaries that would support a future multi-package split.

## Current Private Layers

| Layer         | Current roots                                                    | Intended role                             |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `facade`      | `src/index.ts`                                                   | Public compatibility surface              |
| `contracts`   | `src/types`, `src/validators`                                    | Shared serializable contracts and schemas |
| `core`        | assertions, matchers, prompts, scheduler, test-case logic        | Evaluation domain logic                   |
| `node`        | database, models, config, storage, `src/evaluate.ts`, `src/node` | Node runtime adapters                     |
| `providers`   | `src/providers`                                                  | Concrete provider implementations         |
| `redteam`     | `src/redteam`                                                    | Red-team workflows                        |
| `view-server` | `src/server`                                                     | Local server and API routes               |
| `cli`         | `src/main.ts`, `src/commands`                                    | Command-line orchestration                |
| `app`         | `src/app/src`                                                    | Browser UI                                |

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

## Dependency Ownership Report

The dependency report groups direct runtime imports by the private layer that
currently uses them:

```bash
npm run deps:ownership
```

The report is intentionally descriptive for now. It gives us the evidence needed
to move dependencies into future packages without guessing at ownership.
