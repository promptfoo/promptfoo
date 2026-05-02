# Node API Documentation Critical Review

## Review Standard

Review the Node.js docs against three questions:

1. Can a capable Node.js user discover the supported API without reading source?
2. Does every documented surface explain the contract rather than the implementation?
3. Does the docs set clearly separate stable public APIs, beta APIs, and internal
   compatibility exports?

## Immediate Findings

| Finding                                                                                                                                                                                                 | Why it matters                                                                                           | Action                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The guide called the generated reference the source of truth for exported symbols, but the reference is now intentionally curated.                                                                      | That wording over-promises completeness and obscures the support boundary.                               | Describe the reference as curated and keep the full config shape in the configuration docs.                          |
| Several public signatures mention types that were not present in the curated reference, such as `EvaluateTestSuite` and `LoadApiProviderContext`.                                                       | A reference page should not send users back to source to understand its own signature.                   | Restore compact core types to the curated reference when they remain useful as standalone pages.                     |
| Some remaining generated pages are technically correct but still compiler-shaped, especially `assertions`, `AssertionValueFunctionContext`, `ProviderResponse`, `EvaluateOptions`, and `GradingResult`. | These pages are poor first stops for humans even when they are accurate.                                 | Keep them generated for now, but treat them as candidates for hand-written companion docs or slimmer public facades. |
| `PromptFunctionContext` documents the transformed context for file-backed prompt processors, not the inline `PromptFunction` callback shape shown to Node API users.                                    | Keeping it in the curated reference suggests a relationship that the actual callback type does not have. | Remove it from the curated Node API reference unless we later add a dedicated file-backed prompt-function guide.     |
| `guardrails` exposes result and request types that were not importable from the root package.                                                                                                           | A public beta namespace should not force deep imports for its own input and output types.                | Re-export the guardrail request and response types from the root package and include them in the curated reference.  |
| Parallel hand-written Node API pages drifted from the curated reference by treating config fields as runtime options and beta APIs as stable.                                                           | Multiple conflicting stories make the docs less trustworthy than a single thinner story.                 | Keep hand-written pages task-oriented and point exact signatures back to the generated reference.                    |

## Page Rubric

| Disposition                                          | Pages                                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep generated                                       | `evaluate`, `loadApiProvider`, `isTransformFunction`, cache helpers, `ApiProvider`, `ProviderOptions`, `ProviderFunction`, transform helpers |
| Keep generated with stronger prose or companion docs | `EvaluateOptions`, `Assertion`, `AssertionValueFunction`, `AssertionValueFunctionContext`, `GradingResult`, `ProviderResponse`, `assertions` |
| Keep generated only while beta docs remain thin      | `guardrails`, `redteam`                                                                                                                      |
| Remove from the curated Node API reference           | `PromptFunctionContext`                                                                                                                      |
| Restore for signature closure                        | `EvaluateTestSuite`, `LoadApiProviderContext`, guardrail request/response types                                                              |

## Cold-Read Tasks

Use these tasks when manually reviewing the docs:

1. Run an eval from Node.js.
2. Build a custom provider.
3. Write an inline custom assertion.
4. Reuse `assertions.runAssertion()` outside a full eval.
5. Explain what `evaluate()` accepts without opening source.
6. Explain what `progressCallback` receives.
7. Tell whether `guardrails.*` and `redteam.*` are stable.
8. Find the cache helpers and decide when to use them.

If a reviewer hesitates on one of these tasks, that is a docs bug even if the
generated Markdown is technically valid.
