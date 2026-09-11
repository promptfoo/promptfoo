---
title: 'Interface: GradingResult'
description: 'Result returned by assertions and matcher helpers. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 21
---

## Import

```ts
import type { GradingResult } from 'promptfoo';
```

Defined in: types/index.ts:772

Result returned by assertions and matcher helpers.

## Example

```ts
const result: GradingResult = {
  pass: true,
  score: 1,
  reason: 'Matched expected text',
};
```

## Properties

### assertion?

> `optional` **assertion?**: `object`

Defined in: types/index.ts:795

Assertion that produced this result, when retained by the caller.

#### config?

<!-- prettier-ignore -->
> `optional` **config?**: `Record`\<`string`, `any`\>

Arbitrary custom config exposed to assertion callbacks through `context.config`.

#### contextTransform?

> `optional` **contextTransform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Extract assertion-specific context from output before grading.

#### metric?

> `optional` **metric?**: `string`

Optional metric name used when the assertion contributes a named score.

#### provider?

> `optional` **provider?**: `any`

Provider override used by model-graded assertions that need one.

#### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Rubric override used by model-graded assertions.

#### threshold?

> `optional` **threshold?**: `number`

Minimum score required by threshold-aware assertions such as `similar`.

#### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Transform provider output before this assertion runs.

#### type

> **type**: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"factuality"` \| `"agent-rubric"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"cost"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-factuality"` \| `"not-agent-rubric"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-cost"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

Assertion kind to run, such as `contains`, `javascript`, or `llm-rubric`.

#### value?

> `optional` **value?**: `AssertionValue`

Expected value or callback consumed by assertion types that need one.

#### weight?

> `optional` **weight?**: `number`

Weight of this assertion relative to the rest of the test case. Defaults to `1`.

---

### comment?

> `optional` **comment?**: `string`

Defined in: types/index.ts:798

Optional user-authored comment attached to the result.

---

### componentResults?

> `optional` **componentResults?**: `GradingResult`[]

Defined in: types/index.ts:792

Component results for compound assertions such as assertion sets.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: types/index.ts:804

Additional assertion-specific metadata.

#### Index Signature

\[`key`: `string`\]: `any`

#### cachedResponse?

> `optional` **cachedResponse?**: `boolean`

Whether the complete grading response was reused.

#### context?

> `optional` **context?**: `string` \| `string`[]

Context value used by context-related assertions.

#### contextUnits?

> `optional` **contextUnits?**: `string`[]

Normalized context fragments used by context-related assertions.

#### graderError?

> `optional` **graderError?**: `true`

Set when a grader transport or parse failure prevented a real eval.
Inverse assertions must not flip this into a pass; the field is only
meaningful when present.

#### graderOutputs?

<!-- prettier-ignore -->
> `optional` **graderOutputs?**: `Record`\<`string`, `string`\>

Raw textual responses returned by one or more LLM grader phases.

#### pluginId?

> `optional` **pluginId?**: `string`

Red-team plugin id associated with the result, when applicable.

#### renderedAssertionValue?

> `optional` **renderedAssertionValue?**: `string`

Rendered assertion value after variable substitution.

#### renderedGradingPrompt?

> `optional` **renderedGradingPrompt?**: `string`

Full prompt sent to the grading LLM, retained for debugging.

#### strategyId?

> `optional` **strategyId?**: `string`

Red-team strategy id associated with the result, when applicable.

---

### namedScores?

<!-- prettier-ignore -->
> `optional` **namedScores?**: `Record`\<`string`, `number`\>

Defined in: types/index.ts:783

Map of named metric values emitted by the assertion.

---

### namedScoreWeights?

<!-- prettier-ignore -->
> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: types/index.ts:786

Total weight contributing to each named score.

---

### pass

> **pass**: `boolean`

Defined in: types/index.ts:774

Whether the test passed or failed.

---

### reason

> **reason**: `string`

Defined in: types/index.ts:780

Plain-text explanation suitable for logs and reports.

---

### score

> **score**: `number`

Defined in: types/index.ts:777

Test score, typically between 0 and 1.

---

### suggestions?

> `optional` **suggestions?**: `ResultSuggestion`[]

Defined in: types/index.ts:801

Follow-up suggestions produced by some graders.

---

### tokensUsed?

> `optional` **tokensUsed?**: `object`

Defined in: types/index.ts:789

Token usage attributed to the assertion or grader.

#### assertions?

> `optional` **assertions?**: `object`

##### assertions.cached?

> `optional` **cached?**: `number`

##### assertions.completion?

> `optional` **completion?**: `number`

##### assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### assertions.numRequests?

> `optional` **numRequests?**: `number`

##### assertions.prompt?

> `optional` **prompt?**: `number`

##### assertions.total?

> `optional` **total?**: `number`

#### attacker?

> `optional` **attacker?**: `object`

##### attacker.cached?

> `optional` **cached?**: `number`

##### attacker.completion?

> `optional` **completion?**: `number`

##### attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### attacker.numRequests?

> `optional` **numRequests?**: `number`

##### attacker.prompt?

> `optional` **prompt?**: `number`

##### attacker.total?

> `optional` **total?**: `number`

#### cached?

> `optional` **cached?**: `number`

#### completion?

> `optional` **completion?**: `number`

#### completionDetails?

> `optional` **completionDetails?**: `object`

##### completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

#### generation?

> `optional` **generation?**: `object`

##### generation.cached?

> `optional` **cached?**: `number`

##### generation.completion?

> `optional` **completion?**: `number`

##### generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### generation.numRequests?

> `optional` **numRequests?**: `number`

##### generation.prompt?

> `optional` **prompt?**: `number`

##### generation.total?

> `optional` **total?**: `number`

#### incurredTokenUsage?

> `optional` **incurredTokenUsage?**: `object`

##### incurredTokenUsage.assertions?

> `optional` **assertions?**: `object`

##### incurredTokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.assertions.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.attacker?

> `optional` **attacker?**: `object`

##### incurredTokenUsage.attacker.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.attacker.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.attacker.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.attacker.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.attacker.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.attacker.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.attacker.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.attacker.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.attacker.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.attacker.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.attacker.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.generation?

> `optional` **generation?**: `object`

##### incurredTokenUsage.generation.cached?

> `optional` **cached?**: `number`

##### incurredTokenUsage.generation.completion?

> `optional` **completion?**: `number`

##### incurredTokenUsage.generation.completionDetails?

> `optional` **completionDetails?**: `object`

##### incurredTokenUsage.generation.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

##### incurredTokenUsage.generation.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

##### incurredTokenUsage.generation.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

##### incurredTokenUsage.generation.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

##### incurredTokenUsage.generation.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

##### incurredTokenUsage.generation.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.generation.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.generation.total?

> `optional` **total?**: `number`

##### incurredTokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### incurredTokenUsage.prompt?

> `optional` **prompt?**: `number`

##### incurredTokenUsage.total?

> `optional` **total?**: `number`

#### numRequests?

> `optional` **numRequests?**: `number`

#### prompt?

> `optional` **prompt?**: `number`

#### total?

> `optional` **total?**: `number`
