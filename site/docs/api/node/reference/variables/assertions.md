[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / assertions

# Variable: assertions

> **assertions**: `object`

Defined in: [assertions/index.ts:811](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L811)

Assertion helpers exposed through the Node.js package.

`runAssertion()` and `runAssertions()` are the supported low-level execution
hooks. The matcher helpers are also public and are useful when integrating
promptfoo with test frameworks such as Jest or Vitest.

## Type Declaration

### matchesAnswerRelevance

> **matchesAnswerRelevance**: (`input`, `output`, `threshold`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### input

`string`

##### output

`string`

##### threshold

`number`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesClassification

> **matchesClassification**: (`expected`, `output`, `threshold`, `grading?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### expected

`string` \| `undefined`

Expected classification. If undefined, matches any classification.

##### output

`string`

Text to classify.

##### threshold

`number`

Value between 0 and 1. If the expected classification is undefined, the threshold is the minimum score for any classification. If the expected classification is defined, the threshold is the minimum score for that classification.

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Pass if the output matches the classification with a score greater than or equal to the threshold.

### matchesClosedQa

> **matchesClosedQa**: (`input`, `expected`, `output`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### input

`string`

##### expected

`string`

##### output

`string`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### vars?

`Record`\<`string`, `VarValue`\>

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesComparisonBoolean

> **matchesComparisonBoolean**: (`criteria`, `outputs`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>[]\> = `matchesSelectBest`

#### Parameters

##### criteria

`string`

##### outputs

`string`[]

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### vars?

`Record`\<`string`, `VarValue`\>

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>[]\>

### matchesContextFaithfulness

> **matchesContextFaithfulness**: (`query`, `output`, `context`, `threshold`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### query

`string`

##### output

`string`

##### context

`string` \| `string`[]

##### threshold

`number`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### vars?

`Record`\<`string`, `VarValue`\>

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesContextRecall

> **matchesContextRecall**: (`context`, `groundTruth`, `threshold`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### context

`string` \| `string`[]

##### groundTruth

`string`

##### threshold

`number`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### vars?

`Record`\<`string`, `VarValue`\>

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesContextRelevance

> **matchesContextRelevance**: (`question`, `context`, `threshold`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### question

`string`

##### context

`string` \| `string`[]

##### threshold

`number`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesConversationRelevance

> **matchesConversationRelevance**: (`messages`, `threshold`, `vars?`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### messages

`Message`[]

##### threshold

`number`

##### vars?

`Record`\<`string`, `VarValue`\>

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesFactuality

> **matchesFactuality**: (`input`, `expected`, `output`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### input

`string`

##### expected

`string`

##### output

`string`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### vars?

`Record`\<`string`, `VarValue`\>

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesLlmRubric

> **matchesLlmRubric**: (`rubric`, `llmOutput`, `grading?`, `vars?`, `assertion?`, `options?`, `providerCallContext?`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

#### Parameters

##### rubric

`string` \| `object`

##### llmOutput

`string`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### vars?

`Record`\<`string`, `VarValue`\>

##### assertion?

###### config?

`Record`\<`string`, `any`\> = `...`

###### contextTransform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### metric?

`string` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

###### threshold?

`number` = `...`

###### transform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### type

`"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

###### value?

`AssertionValue` = `...`

###### weight?

`number` = `...`

##### options?

###### preferRemote?

`boolean`

###### throwOnError?

`boolean`

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

### matchesModeration

> **matchesModeration**: (`__namedParameters`, `grading?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### \_\_namedParameters

`ModerationMatchOptions`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### matchesSimilarity

> **matchesSimilarity**: (`expected`, `output`, `threshold`, `inverse`, `grading?`, `metric`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### Parameters

##### expected

`string`

##### output

`string`

##### threshold

`number`

##### inverse?

`boolean` = `false`

##### grading?

###### factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### factuality.agree?

`number` = `...`

###### factuality.differButFactual?

`number` = `...`

###### factuality.disagree?

`number` = `...`

###### factuality.subset?

`number` = `...`

###### factuality.superset?

`number` = `...`

###### provider?

`any` = `...`

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

##### metric?

`SimilarityMetric` = `'cosine'`

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

### runAssertion

> **runAssertion**: (`__namedParameters`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Run one assertion against a provider response.

This is the supported low-level hook for advanced callers that want to reuse
promptfoo assertion logic outside a full eval run.

#### Parameters

##### \_\_namedParameters

###### assertIndex?

`number`

###### assertion

\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \}

###### assertion.config?

`Record`\<`string`, `any`\> = `...`

###### assertion.contextTransform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### assertion.metric?

`string` = `...`

###### assertion.provider?

`any` = `...`

###### assertion.rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

###### assertion.threshold?

`number` = `...`

###### assertion.transform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### assertion.type

`"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

###### assertion.value?

`AssertionValue` = `...`

###### assertion.weight?

`number` = `...`

###### latencyMs?

`number`

###### prompt?

`string`

###### provider?

[`ApiProvider`](../interfaces/ApiProvider.md)

###### providerResponse

[`ProviderResponse`](../interfaces/ProviderResponse.md)

###### test

\{ `assert?`: (\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]; `assertScoringFunction?`: `string` \| `ScoringFunction`; `description?`: `string`; `metadata?`: \{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: `string`[]; `excludeStrategies?`: `string`[]; `graderExamples?`: `object`[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<`string`, ... \| ...\>; `intendedResults?`: `string`[]; `intent?`: `string` \| (... \| ...)[]; `language?`: `string` \| `string`[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<`string`, `unknown`\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: `string`[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: `string`[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: `string`[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: `string`[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: `string`[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: `string`[]; `networkScanPath?`: `string`; `networkScanPaths?`: `string`[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: `string`[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: `string`[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: `string`[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: `string`[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: `string`[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: `string`[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: `string`[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: `string`[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: `string`[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: `string`[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: `string`[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: `string`[]; `secretFilePath?`: `string`; `secretFilePaths?`: `string`[]; `secretFileValue?`: `string`; `secretFileValues?`: `string`[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: `string`[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: `string`[]; `targetSystems?`: `string`[]; `targetUrls?`: `string`[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: `string`[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: `string`[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: `string`[]; `workspaceRoot?`: `string`; `workspaceRoots?`: `string`[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: `string`[]; \}; \}; `options?`: \{\[`key`: `string`\]: `any`; `disableConversationVar?`: `boolean`; `disableDefaultAsserts?`: `boolean`; `disableVarExpansion?`: `boolean`; `factuality?`: \{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \}; `postprocess?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `prefix?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `runSerially?`: `boolean`; `storeOutputAs?`: `string`; `suffix?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `transformVars?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `prompts?`: `string`[]; `provider?`: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: `CallApiFunction`; `callClassificationApi?`: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<`ProviderEmbeddingResponse`\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `providerOutput?`: `string` \| `Record`\<`string`, `unknown`\>; `providers?`: `string`[]; `threshold?`: `number`; `vars?`: `Vars`; \}

###### test.assert?

(\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[] = `...`

###### test.assertScoringFunction?

`string` \| `ScoringFunction` = `...`

###### test.description?

`string` = `...`

###### test.metadata?

\{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: `string`[]; `excludeStrategies?`: `string`[]; `graderExamples?`: `object`[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<`string`, ... \| ...\>; `intendedResults?`: `string`[]; `intent?`: `string` \| (... \| ...)[]; `language?`: `string` \| `string`[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<`string`, `unknown`\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: `string`[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: `string`[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: `string`[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: `string`[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: `string`[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: `string`[]; `networkScanPath?`: `string`; `networkScanPaths?`: `string`[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: `string`[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: `string`[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: `string`[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: `string`[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: `string`[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: `string`[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: `string`[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: `string`[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: `string`[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: `string`[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: `string`[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: `string`[]; `secretFilePath?`: `string`; `secretFilePaths?`: `string`[]; `secretFileValue?`: `string`; `secretFileValues?`: `string`[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: `string`[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: `string`[]; `targetSystems?`: `string`[]; `targetUrls?`: `string`[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: `string`[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: `string`[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: `string`[]; `workspaceRoot?`: `string`; `workspaceRoots?`: `string`[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: `string`[]; \}; \} = `...`

###### test.metadata.pluginConfig?

\{ `__nonce?`: `number`; `examples?`: `string`[]; `excludeStrategies?`: `string`[]; `graderExamples?`: `object`[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<`string`, ... \| ...\>; `intendedResults?`: `string`[]; `intent?`: `string` \| (... \| ...)[]; `language?`: `string` \| `string`[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<`string`, `unknown`\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: `string`[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: `string`[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: `string`[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: `string`[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: `string`[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: `string`[]; `networkScanPath?`: `string`; `networkScanPaths?`: `string`[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: `string`[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: `string`[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: `string`[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: `string`[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: `string`[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: `string`[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: `string`[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: `string`[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: `string`[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: `string`[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: `string`[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: `string`[]; `secretFilePath?`: `string`; `secretFilePaths?`: `string`[]; `secretFileValue?`: `string`; `secretFileValues?`: `string`[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: `string`[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: `string`[]; `targetSystems?`: `string`[]; `targetUrls?`: `string`[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: `string`[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: `string`[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: `string`[]; `workspaceRoot?`: `string`; `workspaceRoots?`: `string`[]; \} = `...`

###### test.metadata.pluginConfig.\_\_nonce?

`number` = `...`

###### test.metadata.pluginConfig.examples?

`string`[] = `...`

###### test.metadata.pluginConfig.excludeStrategies?

`string`[] = `...`

###### test.metadata.pluginConfig.graderExamples?

`object`[] = `...`

###### test.metadata.pluginConfig.graderGuidance?

`string` = `...`

###### test.metadata.pluginConfig.indirectInjectionVar?

`string` = `...`

###### test.metadata.pluginConfig.inputs?

`Record`\<`string`, ... \| ...\> = `...`

###### test.metadata.pluginConfig.intendedResults?

`string`[] = `...`

###### test.metadata.pluginConfig.intent?

`string` \| (... \| ...)[] = `...`

###### test.metadata.pluginConfig.language?

`string` \| `string`[] = `...`

###### test.metadata.pluginConfig.maxCharsPerMessage?

`number` = `...`

###### test.metadata.pluginConfig.mentions?

`boolean` = `...`

###### test.metadata.pluginConfig.modifiers?

`Record`\<`string`, `unknown`\> = `...`

###### test.metadata.pluginConfig.multilingual?

`boolean` = `...`

###### test.metadata.pluginConfig.mustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.mustNotExistPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.name?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHost?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHosts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkAllowedUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.networkEgressHost?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressHosts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkEgressReceipt?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressReceipts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkEgressUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.networkScanPath?

`string` = `...`

###### test.metadata.pluginConfig.networkScanPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.networkTrapHost?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapHosts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkTrapLogPath?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapLogPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.networkTrapUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.networkWorkspacePath?

`string` = `...`

###### test.metadata.pluginConfig.networkWorkspacePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteExpectedSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWritePath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWritePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWritePathSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDirs?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteSha256?

`string` = `...`

###### test.metadata.pluginConfig.policy?

`string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \} = `...`

###### test.metadata.pluginConfig.prompt?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.protectedWritePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedWritePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.purpose?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePath?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.secretFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretFilePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.secretFileValue?

`string` = `...`

###### test.metadata.pluginConfig.secretFileValues?

`string`[] = `...`

###### test.metadata.pluginConfig.secretLocalFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretLocalFilePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.severity?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"` = `...`

###### test.metadata.pluginConfig.ssrfFailThreshold?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` = `...`

###### test.metadata.pluginConfig.systemPrompt?

`string` = `...`

###### test.metadata.pluginConfig.targetIdentifiers?

`string`[] = `...`

###### test.metadata.pluginConfig.targetSystems?

`string`[] = `...`

###### test.metadata.pluginConfig.targetUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.verifierArtifactRoot?

`string` = `...`

###### test.metadata.pluginConfig.verifierArtifactRoots?

`string`[] = `...`

###### test.metadata.pluginConfig.verifierProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.verifierProbeDirs?

`string`[] = `...`

###### test.metadata.pluginConfig.workingDir?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectory?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectoryPath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.workspaceRoot?

`string` = `...`

###### test.metadata.pluginConfig.workspaceRoots?

`string`[] = `...`

###### test.metadata.strategyConfig?

\{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: `string`[]; \} = `...`

###### test.metadata.strategyConfig.enabled?

`boolean` = `...`

###### test.metadata.strategyConfig.numTests?

`number` = `...`

###### test.metadata.strategyConfig.plugins?

`string`[] = `...`

###### test.options?

\{\[`key`: `string`\]: `any`; `disableConversationVar?`: `boolean`; `disableDefaultAsserts?`: `boolean`; `disableVarExpansion?`: `boolean`; `factuality?`: \{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \}; `postprocess?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `prefix?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `runSerially?`: `boolean`; `storeOutputAs?`: `string`; `suffix?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `transformVars?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} = `...`

###### test.options.disableConversationVar?

`boolean` = `...`

###### test.options.disableDefaultAsserts?

`boolean` = `...`

###### test.options.disableVarExpansion?

`boolean` = `...`

###### test.options.factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### test.options.factuality.agree?

`number` = `...`

###### test.options.factuality.differButFactual?

`number` = `...`

###### test.options.factuality.disagree?

`number` = `...`

###### test.options.factuality.subset?

`number` = `...`

###### test.options.factuality.superset?

`number` = `...`

###### test.options.postprocess?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

**Deprecated**

in > 0.38.0. Use `transform` instead.

###### test.options.prefix?

`string` = `...`

###### test.options.provider?

`any` = `...`

###### test.options.rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

###### test.options.runSerially?

`boolean` = `...`

###### test.options.storeOutputAs?

`string` = `...`

###### test.options.suffix?

`string` = `...`

###### test.options.transform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### test.options.transformVars?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### test.prompts?

`string`[] = `...`

###### test.provider?

`string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: `CallApiFunction`; `callClassificationApi?`: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<`ProviderEmbeddingResponse`\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} = `...`

###### test.providerOutput?

`string` \| `Record`\<`string`, `unknown`\> = `...`

###### test.providers?

`string`[] = `...`

###### test.threshold?

`number` = `...`

###### test.vars?

`Vars` = `...`

###### traceData?

`TraceData` \| `null`

###### traceId?

`string`

###### vars?

`Record`\<`string`, `VarValue`\>

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

### runAssertions

> **runAssertions**: (`__namedParameters`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Run all assertions for one test case and aggregate the grading result.

This is the supported batch counterpart to `runAssertion()` for advanced
callers that already have a provider response and test case in hand.

#### Parameters

##### \_\_namedParameters

###### assertScoringFunction?

`ScoringFunction`

###### latencyMs?

`number`

###### prompt?

`string`

###### provider?

[`ApiProvider`](../interfaces/ApiProvider.md)

###### providerResponse

[`ProviderResponse`](../interfaces/ProviderResponse.md)

###### test

\{ `assert?`: (\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]; `assertScoringFunction?`: `string` \| `ScoringFunction`; `description?`: `string`; `metadata?`: \{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: `string`[]; `excludeStrategies?`: `string`[]; `graderExamples?`: `object`[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<`string`, ... \| ...\>; `intendedResults?`: `string`[]; `intent?`: `string` \| (... \| ...)[]; `language?`: `string` \| `string`[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<`string`, `unknown`\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: `string`[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: `string`[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: `string`[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: `string`[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: `string`[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: `string`[]; `networkScanPath?`: `string`; `networkScanPaths?`: `string`[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: `string`[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: `string`[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: `string`[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: `string`[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: `string`[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: `string`[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: `string`[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: `string`[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: `string`[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: `string`[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: `string`[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: `string`[]; `secretFilePath?`: `string`; `secretFilePaths?`: `string`[]; `secretFileValue?`: `string`; `secretFileValues?`: `string`[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: `string`[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: `string`[]; `targetSystems?`: `string`[]; `targetUrls?`: `string`[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: `string`[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: `string`[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: `string`[]; `workspaceRoot?`: `string`; `workspaceRoots?`: `string`[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: `string`[]; \}; \}; `options?`: \{\[`key`: `string`\]: `any`; `disableConversationVar?`: `boolean`; `disableDefaultAsserts?`: `boolean`; `disableVarExpansion?`: `boolean`; `factuality?`: \{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \}; `postprocess?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `prefix?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `runSerially?`: `boolean`; `storeOutputAs?`: `string`; `suffix?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `transformVars?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `prompts?`: `string`[]; `provider?`: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: `CallApiFunction`; `callClassificationApi?`: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<`ProviderEmbeddingResponse`\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `providerOutput?`: `string` \| `Record`\<`string`, `unknown`\>; `providers?`: `string`[]; `threshold?`: `number`; `vars?`: `Vars`; \}

###### test.assert?

(\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[] = `...`

###### test.assertScoringFunction?

`string` \| `ScoringFunction` = `...`

###### test.description?

`string` = `...`

###### test.metadata?

\{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: `string`[]; `excludeStrategies?`: `string`[]; `graderExamples?`: `object`[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<`string`, ... \| ...\>; `intendedResults?`: `string`[]; `intent?`: `string` \| (... \| ...)[]; `language?`: `string` \| `string`[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<`string`, `unknown`\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: `string`[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: `string`[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: `string`[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: `string`[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: `string`[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: `string`[]; `networkScanPath?`: `string`; `networkScanPaths?`: `string`[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: `string`[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: `string`[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: `string`[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: `string`[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: `string`[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: `string`[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: `string`[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: `string`[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: `string`[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: `string`[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: `string`[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: `string`[]; `secretFilePath?`: `string`; `secretFilePaths?`: `string`[]; `secretFileValue?`: `string`; `secretFileValues?`: `string`[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: `string`[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: `string`[]; `targetSystems?`: `string`[]; `targetUrls?`: `string`[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: `string`[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: `string`[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: `string`[]; `workspaceRoot?`: `string`; `workspaceRoots?`: `string`[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: `string`[]; \}; \} = `...`

###### test.metadata.pluginConfig?

\{ `__nonce?`: `number`; `examples?`: `string`[]; `excludeStrategies?`: `string`[]; `graderExamples?`: `object`[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<`string`, ... \| ...\>; `intendedResults?`: `string`[]; `intent?`: `string` \| (... \| ...)[]; `language?`: `string` \| `string`[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<`string`, `unknown`\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: `string`[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: `string`[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: `string`[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: `string`[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: `string`[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: `string`[]; `networkScanPath?`: `string`; `networkScanPaths?`: `string`[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: `string`[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: `string`[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: `string`[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: `string`[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: `string`[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: `string`[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: `string`[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: `string`[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: `string`[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: `string`[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: `string`[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: `string`[]; `secretFilePath?`: `string`; `secretFilePaths?`: `string`[]; `secretFileValue?`: `string`; `secretFileValues?`: `string`[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: `string`[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: `string`[]; `targetSystems?`: `string`[]; `targetUrls?`: `string`[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: `string`[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: `string`[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: `string`[]; `workspaceRoot?`: `string`; `workspaceRoots?`: `string`[]; \} = `...`

###### test.metadata.pluginConfig.\_\_nonce?

`number` = `...`

###### test.metadata.pluginConfig.examples?

`string`[] = `...`

###### test.metadata.pluginConfig.excludeStrategies?

`string`[] = `...`

###### test.metadata.pluginConfig.graderExamples?

`object`[] = `...`

###### test.metadata.pluginConfig.graderGuidance?

`string` = `...`

###### test.metadata.pluginConfig.indirectInjectionVar?

`string` = `...`

###### test.metadata.pluginConfig.inputs?

`Record`\<`string`, ... \| ...\> = `...`

###### test.metadata.pluginConfig.intendedResults?

`string`[] = `...`

###### test.metadata.pluginConfig.intent?

`string` \| (... \| ...)[] = `...`

###### test.metadata.pluginConfig.language?

`string` \| `string`[] = `...`

###### test.metadata.pluginConfig.maxCharsPerMessage?

`number` = `...`

###### test.metadata.pluginConfig.mentions?

`boolean` = `...`

###### test.metadata.pluginConfig.modifiers?

`Record`\<`string`, `unknown`\> = `...`

###### test.metadata.pluginConfig.multilingual?

`boolean` = `...`

###### test.metadata.pluginConfig.mustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.mustNotExistPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.name?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHost?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHosts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkAllowedUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.networkEgressHost?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressHosts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkEgressReceipt?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressReceipts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkEgressUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.networkScanPath?

`string` = `...`

###### test.metadata.pluginConfig.networkScanPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.networkTrapHost?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapHosts?

`string`[] = `...`

###### test.metadata.pluginConfig.networkTrapLogPath?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapLogPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.networkTrapUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.networkWorkspacePath?

`string` = `...`

###### test.metadata.pluginConfig.networkWorkspacePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteExpectedSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWritePath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWritePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWritePathSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDirs?

`string`[] = `...`

###### test.metadata.pluginConfig.outsideWriteSha256?

`string` = `...`

###### test.metadata.pluginConfig.policy?

`string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \} = `...`

###### test.metadata.pluginConfig.prompt?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.protectedWritePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedWritePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.purpose?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePath?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.secretFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretFilePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.secretFileValue?

`string` = `...`

###### test.metadata.pluginConfig.secretFileValues?

`string`[] = `...`

###### test.metadata.pluginConfig.secretLocalFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretLocalFilePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.severity?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"` = `...`

###### test.metadata.pluginConfig.ssrfFailThreshold?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` = `...`

###### test.metadata.pluginConfig.systemPrompt?

`string` = `...`

###### test.metadata.pluginConfig.targetIdentifiers?

`string`[] = `...`

###### test.metadata.pluginConfig.targetSystems?

`string`[] = `...`

###### test.metadata.pluginConfig.targetUrls?

`string`[] = `...`

###### test.metadata.pluginConfig.verifierArtifactRoot?

`string` = `...`

###### test.metadata.pluginConfig.verifierArtifactRoots?

`string`[] = `...`

###### test.metadata.pluginConfig.verifierProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.verifierProbeDirs?

`string`[] = `...`

###### test.metadata.pluginConfig.workingDir?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectory?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectoryPath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePaths?

`string`[] = `...`

###### test.metadata.pluginConfig.workspaceRoot?

`string` = `...`

###### test.metadata.pluginConfig.workspaceRoots?

`string`[] = `...`

###### test.metadata.strategyConfig?

\{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: `string`[]; \} = `...`

###### test.metadata.strategyConfig.enabled?

`boolean` = `...`

###### test.metadata.strategyConfig.numTests?

`number` = `...`

###### test.metadata.strategyConfig.plugins?

`string`[] = `...`

###### test.options?

\{\[`key`: `string`\]: `any`; `disableConversationVar?`: `boolean`; `disableDefaultAsserts?`: `boolean`; `disableVarExpansion?`: `boolean`; `factuality?`: \{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \}; `postprocess?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `prefix?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `runSerially?`: `boolean`; `storeOutputAs?`: `string`; `suffix?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `transformVars?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} = `...`

###### test.options.disableConversationVar?

`boolean` = `...`

###### test.options.disableDefaultAsserts?

`boolean` = `...`

###### test.options.disableVarExpansion?

`boolean` = `...`

###### test.options.factuality?

\{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \} = `...`

###### test.options.factuality.agree?

`number` = `...`

###### test.options.factuality.differButFactual?

`number` = `...`

###### test.options.factuality.disagree?

`number` = `...`

###### test.options.factuality.subset?

`number` = `...`

###### test.options.factuality.superset?

`number` = `...`

###### test.options.postprocess?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

**Deprecated**

in > 0.38.0. Use `transform` instead.

###### test.options.prefix?

`string` = `...`

###### test.options.provider?

`any` = `...`

###### test.options.rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

###### test.options.runSerially?

`boolean` = `...`

###### test.options.storeOutputAs?

`string` = `...`

###### test.options.suffix?

`string` = `...`

###### test.options.transform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### test.options.transformVars?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

###### test.prompts?

`string`[] = `...`

###### test.provider?

`string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: `CallApiFunction`; `callClassificationApi?`: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<`ProviderEmbeddingResponse`\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} = `...`

###### test.providerOutput?

`string` \| `Record`\<`string`, `unknown`\> = `...`

###### test.providers?

`string`[] = `...`

###### test.threshold?

`number` = `...`

###### test.vars?

`Vars` = `...`

###### traceId?

`string`

###### vars?

`Record`\<`string`, `VarValue`\>

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>
