[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / GradingResult

# Interface: GradingResult

Defined in: [types/index.ts:556](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L556)

Result returned by assertions and matcher helpers.

## Properties

### assertion?

> `optional` **assertion?**: `object`

Defined in: [types/index.ts:579](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L579)

Assertion that produced this result, when retained by the caller.

#### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

#### contextTransform?

> `optional` **contextTransform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

#### metric?

> `optional` **metric?**: `string`

#### provider?

> `optional` **provider?**: `any`

#### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

#### threshold?

> `optional` **threshold?**: `number`

#### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

#### type

> **type**: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

#### value?

> `optional` **value?**: `AssertionValue`

#### weight?

> `optional` **weight?**: `number`

---

### comment?

> `optional` **comment?**: `string`

Defined in: [types/index.ts:582](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L582)

Optional user-authored comment attached to the result.

---

### componentResults?

> `optional` **componentResults?**: `GradingResult`[]

Defined in: [types/index.ts:576](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L576)

Component results for compound assertions such as assertion sets.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/index.ts:588](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L588)

Additional assertion-specific metadata.

#### Index Signature

\[`key`: `string`\]: `any`

#### context?

> `optional` **context?**: `string` \| `string`[]

#### contextUnits?

> `optional` **contextUnits?**: `string`[]

#### graderError?

> `optional` **graderError?**: `true`

#### graderOutputs?

> `optional` **graderOutputs?**: `Record`\<`string`, `string`\>

#### pluginId?

> `optional` **pluginId?**: `string`

#### renderedAssertionValue?

> `optional` **renderedAssertionValue?**: `string`

#### renderedGradingPrompt?

> `optional` **renderedGradingPrompt?**: `string`

#### strategyId?

> `optional` **strategyId?**: `string`

---

### namedScores?

> `optional` **namedScores?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:567](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L567)

Map of named metric values emitted by the assertion.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:570](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L570)

Total weight contributing to each named score.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:558](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L558)

Whether the test passed or failed.

---

### reason

> **reason**: `string`

Defined in: [types/index.ts:564](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L564)

Plain-text explanation suitable for logs and reports.

---

### score

> **score**: `number`

Defined in: [types/index.ts:561](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L561)

Test score, typically between 0 and 1.

---

### suggestions?

> `optional` **suggestions?**: `ResultSuggestion`[]

Defined in: [types/index.ts:585](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L585)

Follow-up suggestions produced by some graders.

---

### tokensUsed?

> `optional` **tokensUsed?**: `object`

Defined in: [types/index.ts:573](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L573)

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

##### assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

##### assertions.numRequests?

> `optional` **numRequests?**: `number`

##### assertions.prompt?

> `optional` **prompt?**: `number`

##### assertions.total?

> `optional` **total?**: `number`

#### cached?

> `optional` **cached?**: `number`

#### completion?

> `optional` **completion?**: `number`

#### completionDetails?

> `optional` **completionDetails?**: `object`

##### completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

##### completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

#### numRequests?

> `optional` **numRequests?**: `number`

#### prompt?

> `optional` **prompt?**: `number`

#### total?

> `optional` **total?**: `number`
