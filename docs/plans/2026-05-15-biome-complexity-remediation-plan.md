# Biome Complexity Remediation Plan

Date: 2026-05-15

## Snapshot

Biome is currently clean on errors, but it reports 168 warnings repo-wide:

- 167 `lint/complexity/noExcessiveCognitiveComplexity`
- 1 `lint/nursery/useReduceTypeParameter`

The complexity threshold is `30`. The current complexity warning set averages `59.4`, with a max of `252`.

### Where the warnings live

| Area | Warning count | Complexity weight | Read |
| --- | ---: | ---: | --- |
| `src/providers` | 57 | 3475 | Largest surface, highest leverage |
| `src/redteam` | 26 | 1924 | High risk, high product importance |
| `src/app` | 30 | 1374 | Mostly setup/configuration UI |
| `src/commands` | 16 | 929 | Central CLI orchestration |
| `src/util` | 8 | 458 | Shared helpers with wide blast radius |
| `site` | 4 | 191 | Low urgency |
| `src/server` | 3 | 174 | Small count, meaningful reliability wins |
| `test` | 3 | 144 | Cheap cleanup |
| other `src/*` | 20 | 692 | Mostly one-off cleanup slices |

### Largest individual hotspots

| Complexity | File | Why it matters |
| ---: | --- | --- |
| 252 | `src/commands/eval.ts` | Central eval command path, wide branching surface |
| 230 | `src/providers/bedrock/converse.ts` | Provider content parsing and message normalization |
| 186 | `src/providers/google/live.ts` | Stateful websocket flow and stream handling |
| 171 | `src/redteam/providers/iterativeTree.ts` | Search loop / stop-condition orchestration |
| 169 | `src/redteam/providers/goat.ts` | Attack loop orchestration |
| 154 | `src/redteam/providers/hydra/index.ts` | Attack orchestration and branching |
| 149 | `src/redteam/commands/generate.ts` | Redteam generation command pipeline |
| 148 | `src/redteam/providers/iterative.ts` | Iterative attack flow |
| 145 | `src/evaluatorHelpers.ts` | Shared evaluator branching |
| 141 | `src/providers/openai/chatkit.ts` | Provider request shaping |

## How to rank this work

The right ranking is not "highest complexity first". The better ordering is:

1. **High complexity + central runtime path**
2. **High repetition across a family of files**
3. **High regression risk if left tangled**
4. **Clear extraction boundary**
5. **User-visible product surface**

That points to five real workstreams:

1. Provider request/response normalization
2. Redteam search/orchestration flows
3. CLI eval orchestration
4. Redteam setup UI switchboards
5. Shared parsing/process helpers

Everything else is tail cleanup.

## Refactor patterns to prefer

### 1. Replace giant branch chains with explicit registries

Best for:

- provider type selection
- error classification
- response/content block conversion
- strategy/provider dispatch

Use:

- `Record<Key, Handler>`
- discriminated unions
- small builder functions that return normalized data

Avoid:

- moving the same `if/else` tree into another file unchanged
- generic "utils" files with weak ownership

### 2. Split stateful workflows into phase helpers

Best for:

- eval CLI flow
- websocket providers
- redteam attack loops
- server child-process handling

Use:

- `prepare*`
- `resolve*`
- `handle*`
- `finalize*`

Each helper should own one lifecycle phase and return typed state to the next phase.

### 3. Pull parsing into pure functions first

Best for:

- Bedrock content block parsing
- Postman import
- config/file/json/csv helpers

This is the safest way to cut complexity while improving testability.

### 4. Extract UI decision logic before JSX

Best for:

- provider setup screens
- review/summary cards
- large form sections

Prefer:

- provider preset registries
- derived view models
- small presentational subcomponents

Do not start by fragmenting JSX into tiny components while leaving all decisions in the parent.

## Stack-ranked backlog

### P0. Provider normalization foundation

**Why first:** This is the largest warning cluster and the most reusable cleanup. It also gives the repo a repeatable pattern that can then be applied to the rest of the providers.

**Scope**

- `src/providers/bedrock/converse.ts`
- `src/providers/http.ts`
- `src/providers/openai/chat.ts`
- `src/providers/openai/chatkit.ts`
- `src/providers/openai/realtime.ts`
- `src/providers/anthropic/messages.ts`
- `src/providers/google/live.ts`
- `src/providers/google/vertex.ts`
- `src/providers/claude-agent-sdk.ts`

**Tasks**

1. Extract provider-neutral content parsing helpers.
   - Start with Bedrock `parseConverseMessages`.
   - Separate text, image, document, and tool-call normalization into pure functions.
   - Add focused tests around each content-block family and weird input shape.
2. Extract provider-specific request builders.
   - OpenAI chat/chatkit/realtime should each have small "build request", "build tool config", and "normalize response" helpers.
   - HTTP provider should split request construction from response interpretation and cache handling.
3. Extract streaming/event handlers from transport setup.
   - Google Live and OpenAI Realtime should separate websocket lifecycle from message interpretation.
   - Aim for explicit handlers like `handleSetupComplete`, `handleModelTurn`, `handleGenerationComplete`, `handleToolCall`.
4. Add a tiny shared "provider conversion" test matrix.
   - Cover text-only, multimodal, tool-call, cache-hit, and error paths.

**Acceptance criteria**

- Complexity warnings reduced by at least 20 in provider files.
- No single new helper introduced above complexity `30`.
- Focused provider tests cover each extracted helper family.
- No behavior changes in cache flags, tool choice, or multimodal handling.

**Why not split more aggressively yet**

The provider surface has several semantically similar but not identical adapters. First prove a local pattern inside 2-3 providers, then copy the pattern across the family.

### P1. Redteam search/orchestration cleanup

**Why next:** These are security/product-critical flows with very high complexity scores, and the same state-machine problem repeats across the family.

**Scope**

- `src/redteam/providers/iterativeTree.ts`
- `src/redteam/providers/goat.ts`
- `src/redteam/providers/hydra/index.ts`
- `src/redteam/providers/iterative.ts`
- `src/redteam/providers/iterativeMeta.ts`
- `src/redteam/providers/crescendo/index.ts`
- `src/redteam/providers/custom/index.ts`
- `src/redteam/commands/generate.ts`
- `src/redteam/index.ts`
- `src/redteam/strategies/multilingual.ts`

**Tasks**

1. Introduce explicit attack-run state objects.
   - Pull mutable counters, best-score tracking, stop reasons, and token usage into typed state.
   - Add narrow helpers for "advance one turn", "score candidate", and "record best".
2. Extract stop-condition and branching policy helpers.
   - The tree/iterative family should not embed stop logic inline inside nested loops.
   - Add pure functions for max-depth, max-attempts, no-improvement, and score-threshold checks.
3. Separate prompt rendering from attack execution.
   - `renderSystemPrompts`, per-turn transforms, and final attack prompt selection should be isolated from provider calls.
4. Split generation pipeline orchestration.
   - `src/redteam/commands/generate.ts` and `src/redteam/index.ts` should become phase-oriented: load config, expand plugins, apply strategies, materialize tests, persist/report.
5. Add turn-level regression tests.
   - Use representative iterative/hydra/crescendo fixtures.
   - Assert final prompt selection, stop reason, token accounting, and metadata shape.

**Acceptance criteria**

- Complexity warnings reduced by at least 12 in redteam files.
- The top four redteam functions all drop below `100`.
- Search/stop logic becomes unit-testable without a real provider.
- No changes to generated test semantics unless explicitly called out.

### P1. Eval CLI decomposition

**Why here:** `src/commands/eval.ts` is the single worst hotspot and central to almost every user workflow. It is also likely to benefit from the provider/redteam extraction patterns above.

**Scope**

- `src/commands/eval.ts`
- `src/commands/mcp/tools/runEvaluation.ts`
- `src/evaluatorHelpers.ts`

**Tasks**

1. Split `runEvaluation` into lifecycle phases.
   - config reload / directory resolution
   - resume / retry-errors branching
   - output / write / telemetry setup
   - evaluator execution
   - result finalization
2. Extract CLI mode handling.
   - `resume`, `retryErrors`, cloud UUID configs, watch mode, and no-write conflicts should each get explicit resolver helpers.
3. Extract post-run result handling.
   - export paths, summary printing, error exit decisions, and telemetry can be separated from the main path.
4. Align `runEvaluation.ts` with the same smaller helpers where possible.
5. Add CLI regression tests around the branch points.
   - `--resume`
   - `--retry-errors`
   - cloud config UUID
   - directory config
   - `--no-write` conflicts

**Acceptance criteria**

- `src/commands/eval.ts` top warning drops from `252` to below `80`.
- `evaluatorHelpers.ts` drops below `80`.
- CLI behavior is covered at the mode boundaries, not only happy-path evals.

### P2. Redteam setup UI registry refactor

**Why next:** These are visible product surfaces with very obvious branch chains. They should be cheaper to clean up than the orchestration layers and will improve frontend maintainability quickly.

**Scope**

- `src/app/src/pages/redteam/setup/components/Targets/ProviderTypeSelector.tsx`
- `src/app/src/pages/redteam/setup/components/Targets/PostmanImportDialog.tsx`
- `src/app/src/pages/redteam/setup/components/Targets/ProviderConfigEditor.tsx`
- `src/app/src/pages/redteam/setup/components/Review.tsx`
- `src/app/src/pages/redteam/setup/components/Targets/CustomPoliciesSection.tsx`
- `src/app/src/pages/redteam/setup/components/Targets/HttpEndpointConfiguration.tsx`

**Tasks**

1. Replace provider-selection branch chains with a provider preset registry.
   - `handleProviderTypeSelect` should become lookup + builder invocation.
   - Keep provider labels, tags, defaults, and analytics metadata alongside the preset.
2. Extract Postman parsing utilities.
   - URL extraction
   - header extraction
   - body normalization
   - single-variable prompt replacement
3. Convert review/config sections into derived view models.
   - Parent component computes what to render.
   - Child components mostly render.
4. Pull repeated config form decisions into small hooks/helpers.

**Acceptance criteria**

- `ProviderTypeSelector` drops below `50`.
- `PostmanImportDialog` drops below `40`.
- `Review.tsx` loses at least two complexity warnings.
- UI tests cover preset selection and Postman import normalization.

### P2. Shared config/file/process helpers

**Why next:** These files are not the biggest offenders individually, but they are shared and currently hide a lot of branchy normalization logic.

**Scope**

- `src/util/config/load.ts`
- `src/util/file.ts`
- `src/util/json.ts`
- `src/csv.ts`
- `src/util/convertEvalResultsToTable.ts`
- `src/util/exportToFile/getHeaderForTable.ts`
- `src/server/routes/modelAudit.ts`
- `src/server/routes/blobs.ts`
- `src/server/routes/redteam.ts`

**Tasks**

1. Extract config loader phases.
   - file discovery
   - override merge
   - provider normalization
   - env substitution
2. Split file/json/csv parsing helpers by format concern.
   - parse
   - validate
   - normalize
   - serialize
3. Extract ModelAudit stderr/process-close classification.
   - Keep route handlers thin.
   - Move error classification into a pure helper with direct tests.
4. Extract blob/redteam route response classification helpers.

**Acceptance criteria**

- All shared utility/server complexity warnings below `50`.
- Config and file helpers have direct tests for edge-case parsing.
- Route handlers read mostly as orchestration, not classification logic.

### P3. Low-risk tail cleanup

**Why last:** These warnings are real, but they are lower leverage and some are in code that is intentionally script-like.

**Scope**

- `site/src/plugins/docusaurus-plugin-og-image/index.js`
- `site/src/components/Store/useFourthwall.ts`
- `site/blog/unicode-threats/components/VSCodeSimulator.tsx`
- `test/assertions/meteor.test.ts`
- `test/providers/google/gemini-mcp-integration.test.ts`
- `test/test-hygiene.test.ts`
- `code-scan-action/src/github.ts`
- `examples/redteam-mcp-agent/src/mcp_server/tools/erpTools.js`
- the lone `site/docs/_shared/StrategyTable.tsx` nursery warning

**Tasks**

1. Site OG plugin: split metadata collection, route batching, and image generation into helpers.
2. Tests: extract local fixture builders and assertion helpers instead of carrying long branchy inline logic inside test bodies.
3. Example/code-scan files: simplify only if the readability win is obvious; otherwise use a narrow suppression with a comment explaining why the branchy shape is intentional.
4. Fix `StrategyTable.tsx` reduce typing warning directly.

**Acceptance criteria**

- Site warnings reduced to zero.
- Test warnings reduced to zero.
- Any remaining example/code-scan warning is explicitly suppressed with a rationale.

## Suggested execution order

1. Provider foundation: Bedrock + OpenAI chat/chatkit + HTTP
2. Redteam orchestration: iterativeTree + generate + hydra
3. Eval CLI decomposition
4. Frontend redteam setup registry
5. Remaining providers
6. Shared util/server helpers
7. Site/test/example tail

This order is deliberate:

- It attacks the largest warning pool first.
- It establishes reusable patterns before touching every file.
- It avoids burning time on low-value tail cleanup before the risky core is clearer.

## PR slicing

Do not try to land this as one mega-refactor.

Recommended PR cuts:

1. `refactor(providers): extract bedrock and openai request normalization`
2. `refactor(redteam): split iterative search state and stop logic`
3. `refactor(eval): decompose eval command orchestration`
4. `refactor(redteam): move setup provider presets into registry`
5. `refactor(providers): continue provider normalization cleanup`
6. `refactor(core): simplify shared config and file parsing helpers`
7. `chore(lint): clear low-risk complexity tail`

## What not to do

- Do not chase warning count by mechanically slicing functions into anonymous helpers with no domain names.
- Do not convert branchy business logic into over-generic abstractions just to lower the metric.
- Do not suppress core runtime complexity warnings unless the function is intentionally linear and a refactor would make the code worse.
- Do not start in `site/`, `test/`, or examples while the provider/redteam/CLI hotspots remain.

## Definition of done for the whole campaign

- Repo-wide Biome warning count is zero or close enough that the remainder is explicitly justified and suppressed.
- No new helper introduced above the current threshold of `30`.
- The top 20 current hotspots are gone.
- The refactors improve tests and local reasoning, not just lint output.
