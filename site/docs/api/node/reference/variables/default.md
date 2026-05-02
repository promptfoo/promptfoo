[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / default

# Variable: default

> **default**: `object`

Defined in: [index.ts:445](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/index.ts#L445)

## Type Declaration

### assertions

> **assertions**: `object`

#### assertions.matchesAnswerRelevance

> **matchesAnswerRelevance**: (`input`, `output`, `threshold`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### input

`string`

###### output

`string`

###### threshold

`number`

###### grading?

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

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesClassification

> **matchesClassification**: (`expected`, `output`, `threshold`, `grading?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### expected

`string` \| `undefined`

Expected classification. If undefined, matches any classification.

###### output

`string`

Text to classify.

###### threshold

`number`

Value between 0 and 1. If the expected classification is undefined, the threshold is the minimum score for any classification. If the expected classification is defined, the threshold is the minimum score for that classification.

###### grading?

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

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Pass if the output matches the classification with a score greater than or equal to the threshold.

#### assertions.matchesClosedQa

> **matchesClosedQa**: (`input`, `expected`, `output`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### input

`string`

###### expected

`string`

###### output

`string`

###### grading?

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

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesComparisonBoolean

> **matchesComparisonBoolean**: (`criteria`, `outputs`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>[]\> = `matchesSelectBest`

##### Parameters

###### criteria

`string`

###### outputs

`string`[]

###### grading?

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

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>[]\>

#### assertions.matchesContextFaithfulness

> **matchesContextFaithfulness**: (`query`, `output`, `context`, `threshold`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### query

`string`

###### output

`string`

###### context

`string` \| `string`[]

###### threshold

`number`

###### grading?

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

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesContextRecall

> **matchesContextRecall**: (`context`, `groundTruth`, `threshold`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### context

`string` \| `string`[]

###### groundTruth

`string`

###### threshold

`number`

###### grading?

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

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesContextRelevance

> **matchesContextRelevance**: (`question`, `context`, `threshold`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### question

`string`

###### context

`string` \| `string`[]

###### threshold

`number`

###### grading?

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

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesConversationRelevance

> **matchesConversationRelevance**: (`messages`, `threshold`, `vars?`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### messages

`Message`[]

###### threshold

`number`

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

###### grading?

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

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesFactuality

> **matchesFactuality**: (`input`, `expected`, `output`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### input

`string`

###### expected

`string`

###### output

`string`

###### grading?

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

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesLlmRubric

> **matchesLlmRubric**: (`rubric`, `llmOutput`, `grading?`, `vars?`, `assertion?`, `options?`, `providerCallContext?`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

##### Parameters

###### rubric

`string` \| `object`

###### llmOutput

`string`

###### grading?

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

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

###### assertion?

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

[`AssertionValue`](../type-aliases/AssertionValue.md) = `...`

###### weight?

`number` = `...`

###### options?

###### preferRemote?

`boolean`

###### throwOnError?

`boolean`

###### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

##### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

#### assertions.matchesModeration

> **matchesModeration**: (`__namedParameters`, `grading?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### \_\_namedParameters

`ModerationMatchOptions`

###### grading?

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

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.matchesSimilarity

> **matchesSimilarity**: (`expected`, `output`, `threshold`, `inverse`, `grading?`, `metric`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

##### Parameters

###### expected

`string`

###### output

`string`

###### threshold

`number`

###### inverse?

`boolean` = `false`

###### grading?

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

###### metric?

`SimilarityMetric` = `'cosine'`

##### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

#### assertions.runAssertion

> **runAssertion**: (`__namedParameters`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Run one assertion against a provider response.

This is the supported low-level hook for advanced callers that want to reuse
promptfoo assertion logic outside a full eval run.

##### Parameters

###### \_\_namedParameters

###### assertIndex?

`number`

###### assertion

\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: [`AssertionValue`](../type-aliases/AssertionValue.md); `weight?`: `number`; \}

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

[`AssertionValue`](../type-aliases/AssertionValue.md) = `...`

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

\{ `assert?`: (\{ `config?`: `Record`\<..., ...\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| ...[] \| ...[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${(...)}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: [`AssertionValue`](../type-aliases/AssertionValue.md); `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<..., ...\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]; `assertScoringFunction?`: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md); `description?`: `string`; `metadata?`: \{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: ...[]; `excludeStrategies?`: ...[]; `graderExamples?`: ...[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<..., ...\>; `intendedResults?`: ...[]; `intent?`: `string` \| ...[]; `language?`: `string` \| ...[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<..., ...\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: ...[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: ...[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: ...[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: ...[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: ...[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: ...[]; `networkScanPath?`: `string`; `networkScanPaths?`: ...[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: ...[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: ...[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: ...[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: ...[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: ...[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: ...[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: ...[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: ...[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: ...[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: ...[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: ...[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: ...[]; `secretFilePath?`: `string`; `secretFilePaths?`: ...[]; `secretFileValue?`: `string`; `secretFileValues?`: ...[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: ...[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: ...[]; `targetSystems?`: ...[]; `targetUrls?`: ...[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: ...[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: ...[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: ...[]; `workspaceRoot?`: `string`; `workspaceRoots?`: ...[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: ...[]; \}; \}; `options?`: \{\[`key`: `string`\]: `any`; `disableConversationVar?`: `boolean`; `disableDefaultAsserts?`: `boolean`; `disableVarExpansion?`: `boolean`; `factuality?`: \{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \}; `postprocess?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `prefix?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `runSerially?`: `boolean`; `storeOutputAs?`: `string`; `suffix?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `transformVars?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `prompts?`: `string`[]; `provider?`: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](../type-aliases/CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](../interfaces/ProviderClassificationResponse.md)\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<[`ProviderEmbeddingResponse`](../interfaces/ProviderEmbeddingResponse.md)\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `providerOutput?`: `string` \| `Record`\<`string`, `unknown`\>; `providers?`: `string`[]; `threshold?`: `number`; `vars?`: [`Vars`](../type-aliases/Vars.md); \}

###### test.assert?

(\{ `config?`: `Record`\<..., ...\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| ...[] \| ...[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${(...)}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: [`AssertionValue`](../type-aliases/AssertionValue.md); `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<..., ...\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[] = `...`

###### test.assertScoringFunction?

`string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md) = `...`

###### test.description?

`string` = `...`

###### test.metadata?

\{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: ...[]; `excludeStrategies?`: ...[]; `graderExamples?`: ...[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<..., ...\>; `intendedResults?`: ...[]; `intent?`: `string` \| ...[]; `language?`: `string` \| ...[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<..., ...\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: ...[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: ...[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: ...[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: ...[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: ...[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: ...[]; `networkScanPath?`: `string`; `networkScanPaths?`: ...[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: ...[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: ...[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: ...[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: ...[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: ...[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: ...[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: ...[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: ...[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: ...[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: ...[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: ...[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: ...[]; `secretFilePath?`: `string`; `secretFilePaths?`: ...[]; `secretFileValue?`: `string`; `secretFileValues?`: ...[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: ...[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: ...[]; `targetSystems?`: ...[]; `targetUrls?`: ...[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: ...[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: ...[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: ...[]; `workspaceRoot?`: `string`; `workspaceRoots?`: ...[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: ...[]; \}; \} = `...`

###### test.metadata.pluginConfig?

\{ `__nonce?`: `number`; `examples?`: ...[]; `excludeStrategies?`: ...[]; `graderExamples?`: ...[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<..., ...\>; `intendedResults?`: ...[]; `intent?`: `string` \| ...[]; `language?`: `string` \| ...[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<..., ...\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: ...[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: ...[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: ...[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: ...[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: ...[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: ...[]; `networkScanPath?`: `string`; `networkScanPaths?`: ...[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: ...[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: ...[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: ...[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: ...[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: ...[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: ...[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: ...[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: ...[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: ...[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: ...[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: ...[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: ...[]; `secretFilePath?`: `string`; `secretFilePaths?`: ...[]; `secretFileValue?`: `string`; `secretFileValues?`: ...[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: ...[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: ...[]; `targetSystems?`: ...[]; `targetUrls?`: ...[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: ...[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: ...[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: ...[]; `workspaceRoot?`: `string`; `workspaceRoots?`: ...[]; \} = `...`

###### test.metadata.pluginConfig.\_\_nonce?

`number` = `...`

###### test.metadata.pluginConfig.examples?

...[] = `...`

###### test.metadata.pluginConfig.excludeStrategies?

...[] = `...`

###### test.metadata.pluginConfig.graderExamples?

...[] = `...`

###### test.metadata.pluginConfig.graderGuidance?

`string` = `...`

###### test.metadata.pluginConfig.indirectInjectionVar?

`string` = `...`

###### test.metadata.pluginConfig.inputs?

`Record`\<..., ...\> = `...`

###### test.metadata.pluginConfig.intendedResults?

...[] = `...`

###### test.metadata.pluginConfig.intent?

`string` \| ...[] = `...`

###### test.metadata.pluginConfig.language?

`string` \| ...[] = `...`

###### test.metadata.pluginConfig.maxCharsPerMessage?

`number` = `...`

###### test.metadata.pluginConfig.mentions?

`boolean` = `...`

###### test.metadata.pluginConfig.modifiers?

`Record`\<..., ...\> = `...`

###### test.metadata.pluginConfig.multilingual?

`boolean` = `...`

###### test.metadata.pluginConfig.mustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.mustNotExistPaths?

...[] = `...`

###### test.metadata.pluginConfig.name?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHost?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHosts?

...[] = `...`

###### test.metadata.pluginConfig.networkAllowedUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedUrls?

...[] = `...`

###### test.metadata.pluginConfig.networkEgressHost?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressHosts?

...[] = `...`

###### test.metadata.pluginConfig.networkEgressReceipt?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressReceipts?

...[] = `...`

###### test.metadata.pluginConfig.networkEgressUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressUrls?

...[] = `...`

###### test.metadata.pluginConfig.networkScanPath?

`string` = `...`

###### test.metadata.pluginConfig.networkScanPaths?

...[] = `...`

###### test.metadata.pluginConfig.networkTrapHost?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapHosts?

...[] = `...`

###### test.metadata.pluginConfig.networkTrapLogPath?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapLogPaths?

...[] = `...`

###### test.metadata.pluginConfig.networkTrapUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapUrls?

...[] = `...`

###### test.metadata.pluginConfig.networkWorkspacePath?

`string` = `...`

###### test.metadata.pluginConfig.networkWorkspacePaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteExpectedSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWritePath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWritePaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWritePathSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDirs?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteSha256?

`string` = `...`

###### test.metadata.pluginConfig.policy?

`string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \} = `...`

###### test.metadata.pluginConfig.prompt?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePaths?

...[] = `...`

###### test.metadata.pluginConfig.protectedWritePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedWritePaths?

...[] = `...`

###### test.metadata.pluginConfig.purpose?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePath?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePaths?

...[] = `...`

###### test.metadata.pluginConfig.secretFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretFilePaths?

...[] = `...`

###### test.metadata.pluginConfig.secretFileValue?

`string` = `...`

###### test.metadata.pluginConfig.secretFileValues?

...[] = `...`

###### test.metadata.pluginConfig.secretLocalFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretLocalFilePaths?

...[] = `...`

###### test.metadata.pluginConfig.severity?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"` = `...`

###### test.metadata.pluginConfig.ssrfFailThreshold?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` = `...`

###### test.metadata.pluginConfig.systemPrompt?

`string` = `...`

###### test.metadata.pluginConfig.targetIdentifiers?

...[] = `...`

###### test.metadata.pluginConfig.targetSystems?

...[] = `...`

###### test.metadata.pluginConfig.targetUrls?

...[] = `...`

###### test.metadata.pluginConfig.verifierArtifactRoot?

`string` = `...`

###### test.metadata.pluginConfig.verifierArtifactRoots?

...[] = `...`

###### test.metadata.pluginConfig.verifierProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.verifierProbeDirs?

...[] = `...`

###### test.metadata.pluginConfig.workingDir?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectory?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectoryPath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePaths?

...[] = `...`

###### test.metadata.pluginConfig.workspaceRoot?

`string` = `...`

###### test.metadata.pluginConfig.workspaceRoots?

...[] = `...`

###### test.metadata.strategyConfig?

\{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: ...[]; \} = `...`

###### test.metadata.strategyConfig.enabled?

`boolean` = `...`

###### test.metadata.strategyConfig.numTests?

`number` = `...`

###### test.metadata.strategyConfig.plugins?

...[] = `...`

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

`string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](../type-aliases/CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](../interfaces/ProviderClassificationResponse.md)\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<[`ProviderEmbeddingResponse`](../interfaces/ProviderEmbeddingResponse.md)\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} = `...`

###### test.providerOutput?

`string` \| `Record`\<`string`, `unknown`\> = `...`

###### test.providers?

`string`[] = `...`

###### test.threshold?

`number` = `...`

###### test.vars?

[`Vars`](../type-aliases/Vars.md) = `...`

###### traceData?

[`TraceData`](../interfaces/TraceData.md) \| `null`

###### traceId?

`string`

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

##### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

#### assertions.runAssertions

> **runAssertions**: (`__namedParameters`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Run all assertions for one test case and aggregate the grading result.

This is the supported batch counterpart to `runAssertion()` for advanced
callers that already have a provider response and test case in hand.

##### Parameters

###### \_\_namedParameters

###### assertScoringFunction?

[`ScoringFunction`](../type-aliases/ScoringFunction.md)

###### latencyMs?

`number`

###### prompt?

`string`

###### provider?

[`ApiProvider`](../interfaces/ApiProvider.md)

###### providerResponse

[`ProviderResponse`](../interfaces/ProviderResponse.md)

###### test

\{ `assert?`: (\{ `config?`: `Record`\<..., ...\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| ...[] \| ...[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${(...)}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: [`AssertionValue`](../type-aliases/AssertionValue.md); `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<..., ...\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]; `assertScoringFunction?`: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md); `description?`: `string`; `metadata?`: \{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: ...[]; `excludeStrategies?`: ...[]; `graderExamples?`: ...[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<..., ...\>; `intendedResults?`: ...[]; `intent?`: `string` \| ...[]; `language?`: `string` \| ...[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<..., ...\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: ...[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: ...[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: ...[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: ...[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: ...[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: ...[]; `networkScanPath?`: `string`; `networkScanPaths?`: ...[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: ...[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: ...[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: ...[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: ...[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: ...[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: ...[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: ...[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: ...[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: ...[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: ...[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: ...[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: ...[]; `secretFilePath?`: `string`; `secretFilePaths?`: ...[]; `secretFileValue?`: `string`; `secretFileValues?`: ...[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: ...[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: ...[]; `targetSystems?`: ...[]; `targetUrls?`: ...[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: ...[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: ...[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: ...[]; `workspaceRoot?`: `string`; `workspaceRoots?`: ...[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: ...[]; \}; \}; `options?`: \{\[`key`: `string`\]: `any`; `disableConversationVar?`: `boolean`; `disableDefaultAsserts?`: `boolean`; `disableVarExpansion?`: `boolean`; `factuality?`: \{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \}; `postprocess?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `prefix?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `runSerially?`: `boolean`; `storeOutputAs?`: `string`; `suffix?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `transformVars?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `prompts?`: `string`[]; `provider?`: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](../type-aliases/CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](../interfaces/ProviderClassificationResponse.md)\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<[`ProviderEmbeddingResponse`](../interfaces/ProviderEmbeddingResponse.md)\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `providerOutput?`: `string` \| `Record`\<`string`, `unknown`\>; `providers?`: `string`[]; `threshold?`: `number`; `vars?`: [`Vars`](../type-aliases/Vars.md); \}

###### test.assert?

(\{ `config?`: `Record`\<..., ...\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| ...[] \| ...[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${(...)}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: [`AssertionValue`](../type-aliases/AssertionValue.md); `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<..., ...\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[] = `...`

###### test.assertScoringFunction?

`string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md) = `...`

###### test.description?

`string` = `...`

###### test.metadata?

\{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: ...[]; `excludeStrategies?`: ...[]; `graderExamples?`: ...[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<..., ...\>; `intendedResults?`: ...[]; `intent?`: `string` \| ...[]; `language?`: `string` \| ...[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<..., ...\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: ...[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: ...[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: ...[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: ...[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: ...[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: ...[]; `networkScanPath?`: `string`; `networkScanPaths?`: ...[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: ...[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: ...[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: ...[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: ...[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: ...[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: ...[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: ...[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: ...[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: ...[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: ...[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: ...[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: ...[]; `secretFilePath?`: `string`; `secretFilePaths?`: ...[]; `secretFileValue?`: `string`; `secretFileValues?`: ...[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: ...[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: ...[]; `targetSystems?`: ...[]; `targetUrls?`: ...[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: ...[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: ...[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: ...[]; `workspaceRoot?`: `string`; `workspaceRoots?`: ...[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: ...[]; \}; \} = `...`

###### test.metadata.pluginConfig?

\{ `__nonce?`: `number`; `examples?`: ...[]; `excludeStrategies?`: ...[]; `graderExamples?`: ...[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<..., ...\>; `intendedResults?`: ...[]; `intent?`: `string` \| ...[]; `language?`: `string` \| ...[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<..., ...\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: ...[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: ...[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: ...[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: ...[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: ...[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: ...[]; `networkScanPath?`: `string`; `networkScanPaths?`: ...[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: ...[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: ...[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: ...[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: ...[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: ...[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: ...[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: ...[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: ...[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: ...[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: ...[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: ...[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: ...[]; `secretFilePath?`: `string`; `secretFilePaths?`: ...[]; `secretFileValue?`: `string`; `secretFileValues?`: ...[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: ...[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: ...[]; `targetSystems?`: ...[]; `targetUrls?`: ...[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: ...[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: ...[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: ...[]; `workspaceRoot?`: `string`; `workspaceRoots?`: ...[]; \} = `...`

###### test.metadata.pluginConfig.\_\_nonce?

`number` = `...`

###### test.metadata.pluginConfig.examples?

...[] = `...`

###### test.metadata.pluginConfig.excludeStrategies?

...[] = `...`

###### test.metadata.pluginConfig.graderExamples?

...[] = `...`

###### test.metadata.pluginConfig.graderGuidance?

`string` = `...`

###### test.metadata.pluginConfig.indirectInjectionVar?

`string` = `...`

###### test.metadata.pluginConfig.inputs?

`Record`\<..., ...\> = `...`

###### test.metadata.pluginConfig.intendedResults?

...[] = `...`

###### test.metadata.pluginConfig.intent?

`string` \| ...[] = `...`

###### test.metadata.pluginConfig.language?

`string` \| ...[] = `...`

###### test.metadata.pluginConfig.maxCharsPerMessage?

`number` = `...`

###### test.metadata.pluginConfig.mentions?

`boolean` = `...`

###### test.metadata.pluginConfig.modifiers?

`Record`\<..., ...\> = `...`

###### test.metadata.pluginConfig.multilingual?

`boolean` = `...`

###### test.metadata.pluginConfig.mustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.mustNotExistPaths?

...[] = `...`

###### test.metadata.pluginConfig.name?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHost?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedHosts?

...[] = `...`

###### test.metadata.pluginConfig.networkAllowedUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkAllowedUrls?

...[] = `...`

###### test.metadata.pluginConfig.networkEgressHost?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressHosts?

...[] = `...`

###### test.metadata.pluginConfig.networkEgressReceipt?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressReceipts?

...[] = `...`

###### test.metadata.pluginConfig.networkEgressUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkEgressUrls?

...[] = `...`

###### test.metadata.pluginConfig.networkScanPath?

`string` = `...`

###### test.metadata.pluginConfig.networkScanPaths?

...[] = `...`

###### test.metadata.pluginConfig.networkTrapHost?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapHosts?

...[] = `...`

###### test.metadata.pluginConfig.networkTrapLogPath?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapLogPaths?

...[] = `...`

###### test.metadata.pluginConfig.networkTrapUrl?

`string` = `...`

###### test.metadata.pluginConfig.networkTrapUrls?

...[] = `...`

###### test.metadata.pluginConfig.networkWorkspacePath?

`string` = `...`

###### test.metadata.pluginConfig.networkWorkspacePaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteAllowedPaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteExpectedSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteHostPaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteMustNotExistPaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWritePath?

`string` = `...`

###### test.metadata.pluginConfig.outsideWritePaths?

...[] = `...`

###### test.metadata.pluginConfig.outsideWritePathSha256?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.outsideWriteProbeDirs?

...[] = `...`

###### test.metadata.pluginConfig.outsideWriteSha256?

`string` = `...`

###### test.metadata.pluginConfig.policy?

`string` \| \{ `id`: ...; `name?`: ...; `text?`: ...; \} = `...`

###### test.metadata.pluginConfig.prompt?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedFilePaths?

...[] = `...`

###### test.metadata.pluginConfig.protectedWritePath?

`string` = `...`

###### test.metadata.pluginConfig.protectedWritePaths?

...[] = `...`

###### test.metadata.pluginConfig.purpose?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePath?

`string` = `...`

###### test.metadata.pluginConfig.sandboxWritePaths?

...[] = `...`

###### test.metadata.pluginConfig.secretFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretFilePaths?

...[] = `...`

###### test.metadata.pluginConfig.secretFileValue?

`string` = `...`

###### test.metadata.pluginConfig.secretFileValues?

...[] = `...`

###### test.metadata.pluginConfig.secretLocalFilePath?

`string` = `...`

###### test.metadata.pluginConfig.secretLocalFilePaths?

...[] = `...`

###### test.metadata.pluginConfig.severity?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"` = `...`

###### test.metadata.pluginConfig.ssrfFailThreshold?

`"critical"` \| `"high"` \| `"medium"` \| `"low"` = `...`

###### test.metadata.pluginConfig.systemPrompt?

`string` = `...`

###### test.metadata.pluginConfig.targetIdentifiers?

...[] = `...`

###### test.metadata.pluginConfig.targetSystems?

...[] = `...`

###### test.metadata.pluginConfig.targetUrls?

...[] = `...`

###### test.metadata.pluginConfig.verifierArtifactRoot?

`string` = `...`

###### test.metadata.pluginConfig.verifierArtifactRoots?

...[] = `...`

###### test.metadata.pluginConfig.verifierProbeDir?

`string` = `...`

###### test.metadata.pluginConfig.verifierProbeDirs?

...[] = `...`

###### test.metadata.pluginConfig.workingDir?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectory?

`string` = `...`

###### test.metadata.pluginConfig.workingDirectoryPath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePath?

`string` = `...`

###### test.metadata.pluginConfig.workspacePaths?

...[] = `...`

###### test.metadata.pluginConfig.workspaceRoot?

`string` = `...`

###### test.metadata.pluginConfig.workspaceRoots?

...[] = `...`

###### test.metadata.strategyConfig?

\{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: ...[]; \} = `...`

###### test.metadata.strategyConfig.enabled?

`boolean` = `...`

###### test.metadata.strategyConfig.numTests?

`number` = `...`

###### test.metadata.strategyConfig.plugins?

...[] = `...`

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

`string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](../type-aliases/CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](../interfaces/ProviderClassificationResponse.md)\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<[`ProviderEmbeddingResponse`](../interfaces/ProviderEmbeddingResponse.md)\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ...; `description`: ...; `type?`: ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} = `...`

###### test.providerOutput?

`string` \| `Record`\<`string`, `unknown`\> = `...`

###### test.providers?

`string`[] = `...`

###### test.threshold?

`number` = `...`

###### test.vars?

[`Vars`](../type-aliases/Vars.md) = `...`

###### traceId?

`string`

###### vars?

`Record`\<`string`, [`VarValue`](../type-aliases/VarValue.md)\>

##### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

### cache

> **cache**: [`cache`](../promptfoo/namespaces/cache/README.md)

### evaluate

> **evaluate**: (`testSuite`, `options`) => `Promise`\<`Eval`\>

Run an eval from a JavaScript or TypeScript program.

`testSuite` uses the same concepts as a YAML config, but the Node.js API also
accepts function-valued prompts, providers, assertions, and transforms where
the corresponding types allow them.

#### Parameters

##### testSuite

[`EvaluateTestSuite`](../type-aliases/EvaluateTestSuite.md)

Prompts, providers, tests, and other eval configuration.

##### options?

[`EvaluateOptions`](../type-aliases/EvaluateOptions.md) = `{}`

Runtime-only evaluation options such as caching and
concurrency.

#### Returns

`Promise`\<`Eval`\>

The completed eval record, including result rows and persisted state
when `writeLatestResults` is enabled.

#### Example

```ts
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate({
  prompts: ['Answer briefly: {{question}}'],
  providers: ['openai:gpt-5-mini'],
  tests: [{ vars: { question: 'What is 2 + 2?' } }],
});
```

### guardrails

> **guardrails**: `object`

**`Beta`**

Programmatic access to promptfoo guardrail endpoints.

#### guardrails.adaptive()

> **adaptive**(`request`): `Promise`\<`AdaptiveResult`\>

##### Parameters

###### request

`AdaptiveRequest`

##### Returns

`Promise`\<`AdaptiveResult`\>

#### guardrails.guard()

> **guard**(`input`): `Promise`\<`GuardResult`\>

##### Parameters

###### input

`string`

##### Returns

`Promise`\<`GuardResult`\>

#### guardrails.harm()

> **harm**(`input`): `Promise`\<`GuardResult`\>

##### Parameters

###### input

`string`

##### Returns

`Promise`\<`GuardResult`\>

#### guardrails.pii()

> **pii**(`input`): `Promise`\<`GuardResult`\>

##### Parameters

###### input

`string`

##### Returns

`Promise`\<`GuardResult`\>

### loadApiProvider

> **loadApiProvider**: (`providerPath`, `context`) => `Promise`\<[`ApiProvider`](../interfaces/ApiProvider.md)\>

Load one provider by id or config-file reference.

Use this when you need to construct a provider before passing it into another
public API. For ordinary evals, passing provider refs directly to `evaluate()`
is usually simpler.

#### Parameters

##### providerPath

`string`

Provider id or supported provider config file reference.

##### context?

[`LoadApiProviderContext`](../interfaces/LoadApiProviderContext.md) = `{}`

Optional base path, environment overrides, and provider
options.

#### Returns

`Promise`\<[`ApiProvider`](../interfaces/ApiProvider.md)\>

A resolved provider instance.

### redteam

> **redteam**: `object`

**`Beta`**

Advanced red team helpers exposed through the Node.js package.

This surface is still evolving; prefer the CLI and documented red team config
flows unless you specifically need programmatic orchestration.

#### redteam.Base

> **Base**: `object`

#### redteam.Base.Grader

> **Grader**: _typeof_ `RedteamGraderBase` = `RedteamGraderBase`

#### redteam.Base.Plugin

> **Plugin**: _typeof_ `RedteamPluginBase` = `RedteamPluginBase`

#### redteam.Extractors

> **Extractors**: `object`

#### redteam.Extractors.extractEntities

> **extractEntities**: (`provider`, `prompts`) => `Promise`\<`string`[]\>

##### Parameters

###### provider

[`ApiProvider`](../interfaces/ApiProvider.md)

###### prompts

`string`[]

##### Returns

`Promise`\<`string`[]\>

#### redteam.Extractors.extractMcpToolsInfo

> **extractMcpToolsInfo**: (`providers`) => `Promise`\<`string`\>

Extract tools information from MCP providers and format for red team purpose

##### Parameters

###### providers

[`ApiProvider`](../interfaces/ApiProvider.md)[]

##### Returns

`Promise`\<`string`\>

#### redteam.Extractors.extractSystemPurpose

> **extractSystemPurpose**: (`provider`, `prompts`) => `Promise`\<`string`\>

##### Parameters

###### provider

[`ApiProvider`](../interfaces/ApiProvider.md)

###### prompts

`string`[]

##### Returns

`Promise`\<`string`\>

#### redteam.generate

> **generate**: (`options`) => `Promise`\<`Partial`\<\{ `commandLineOptions?`: \{ `assertions?`: `string`; `cache?`: `boolean`; `config?`: ...[]; `delay?`: `number`; `description?`: `string`; `envPath?`: `string` \| ...[]; `extension?`: ...[]; `filterErrorsOnly?`: `string`; `filterFailing?`: `string`; `filterFailingOnly?`: `string`; `filterFirstN?`: `number`; `filterMetadata?`: `string` \| ...[]; `filterPattern?`: `string`; `filterPrompts?`: `string`; `filterProviders?`: `string`; `filterRange?`: `string`; `filterSample?`: `number`; `filterTargets?`: `string`; `generateSuggestions?`: `boolean`; `grader?`: `string`; `maxConcurrency?`: `number`; `modelOutputs?`: `string`; `noShare?`: `boolean`; `output?`: ...[]; `progressBar?`: `boolean`; `promptPrefix?`: `string`; `prompts?`: ...[]; `promptSuffix?`: `string`; `providers?`: ...[]; `repeat?`: `number`; `retryErrors?`: `boolean`; `share?`: `boolean`; `table?`: `boolean`; `tableCellMaxLength?`: `number`; `tests?`: `string`; `var?`: `Record`\<..., ...\>; `vars?`: `string`; `verbose?`: `boolean`; `watch?`: `boolean`; `write?`: `boolean`; \}; `defaultTest?`: `string` \| \{ `assert?`: ...[]; `assertScoringFunction?`: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md); `metadata?`: \{\[`key`: ...\]: ...; `pluginConfig?`: ...; `strategyConfig?`: ...; \}; `options?`: \{\[`key`: ...\]: ...; `disableConversationVar?`: ...; `disableDefaultAsserts?`: ...; `disableVarExpansion?`: ...; `factuality?`: ...; `postprocess?`: ...; `prefix?`: ...; `provider?`: ...; `rubricPrompt?`: ...; `runSerially?`: ...; `storeOutputAs?`: ...; `suffix?`: ...; `transform?`: ...; `transformVars?`: ...; \}; `prompts?`: ...[]; `provider?`: `string` \| \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \} \| \{ `callApi`: ...; `callClassificationApi?`: ...; `callEmbeddingApi?`: ...; `config?`: ...; `delay?`: ...; `id`: ...; `inputs?`: ...; `label?`: ...; `transform?`: ...; \}; `providerOutput?`: `string` \| `Record`\<..., ...\>; `providers?`: ...[]; `threshold?`: `number`; `vars?`: [`Vars`](../type-aliases/Vars.md); \}; `derivedMetrics?`: `object`[]; `description?`: `string`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \} \| `Record`\<`string`, `string`\>; `evaluateOptions?`: \{ `cache?`: `boolean`; `delay?`: `number`; `eventSource?`: `string`; `filterRange?`: `string`; `generateSuggestions?`: `boolean`; `interactiveProviders?`: `boolean`; `isRedteam?`: `boolean`; `maxConcurrency?`: `number`; `maxEvalTimeMs?`: `number`; `progressCallback?`: (`completed`, `total`, `index`, `evalStep`, `metrics`) => ...; `repeat?`: `number`; `showProgressBar?`: `boolean`; `silent?`: `boolean`; `timeoutMs?`: `number`; \}; `extensions?`: `string`[] \| `null`; `metadata?`: `Record`\<`string`, `any`\>; `nunjucksFilters?`: `Record`\<`string`, `string`\>; `outputPath?`: `string` \| `string`[]; `prompts`: `string` \| `Record`\<`string`, `string`\> \| (`string` \| \{ `config?`: ...; `display?`: ...; `function?`: ...; `id?`: ...; `label`: ...; `raw`: ...; `template?`: ...; \} \| \{ `id`: ...; `label?`: ...; `raw?`: ...; \})[]; `providers?`: `string` \| [`CallApiFunction`](../type-aliases/CallApiFunction.md) & `object` \| (`string` \| ... & ... \| \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \} \| `Record`\<..., ...\>)[]; `redteam?`: [`RedteamFileConfig`](../interfaces/RedteamFileConfig.md); `scenarios?`: (`string` \| \{ `config`: ...; `description?`: ...; `tests`: ...; \})[]; `sharing?`: `boolean` \| \{ `apiBaseUrl?`: `string`; `appBaseUrl?`: `string`; \}; `tags?`: `Record`\<`string`, `string`\>; `targets?`: `string` \| [`CallApiFunction`](../type-aliases/CallApiFunction.md) & `object` \| (`string` \| ... & ... \| \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \} \| `Record`\<..., ...\>)[]; `tests?`: `string` \| \{ `config?`: `Record`\<..., ...\>; `path`: `string`; \} \| (`string` \| \{ `assert?`: ...; `assertScoringFunction?`: ...; `description?`: ...; `metadata?`: ...; `options?`: ...; `prompts?`: ...; `provider?`: ...; `providerOutput?`: ...; `providers?`: ...; `threshold?`: ...; `vars?`: ...; \} \| \{ `config?`: ...; `path`: ...; \})[]; `tracing?`: \{ `enabled`: `boolean`; `forwarding?`: \{ `enabled`: ...; `endpoint`: ...; `headers?`: ...; \}; `otlp?`: \{ `grpc?`: ...; `http?`: ...; \}; `storage?`: \{ `retentionDays`: ...; `type`: ...; \}; \}; `writeLatestResults?`: `boolean`; \}\> \| `null`\> = `doGenerateRedteam`

##### Parameters

###### options

`Partial`\<[`RedteamCliGenerateOptions`](../interfaces/RedteamCliGenerateOptions.md)\>

##### Returns

`Promise`\<`Partial`\<\{ `commandLineOptions?`: \{ `assertions?`: `string`; `cache?`: `boolean`; `config?`: ...[]; `delay?`: `number`; `description?`: `string`; `envPath?`: `string` \| ...[]; `extension?`: ...[]; `filterErrorsOnly?`: `string`; `filterFailing?`: `string`; `filterFailingOnly?`: `string`; `filterFirstN?`: `number`; `filterMetadata?`: `string` \| ...[]; `filterPattern?`: `string`; `filterPrompts?`: `string`; `filterProviders?`: `string`; `filterRange?`: `string`; `filterSample?`: `number`; `filterTargets?`: `string`; `generateSuggestions?`: `boolean`; `grader?`: `string`; `maxConcurrency?`: `number`; `modelOutputs?`: `string`; `noShare?`: `boolean`; `output?`: ...[]; `progressBar?`: `boolean`; `promptPrefix?`: `string`; `prompts?`: ...[]; `promptSuffix?`: `string`; `providers?`: ...[]; `repeat?`: `number`; `retryErrors?`: `boolean`; `share?`: `boolean`; `table?`: `boolean`; `tableCellMaxLength?`: `number`; `tests?`: `string`; `var?`: `Record`\<..., ...\>; `vars?`: `string`; `verbose?`: `boolean`; `watch?`: `boolean`; `write?`: `boolean`; \}; `defaultTest?`: `string` \| \{ `assert?`: ...[]; `assertScoringFunction?`: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md); `metadata?`: \{\[`key`: ...\]: ...; `pluginConfig?`: ...; `strategyConfig?`: ...; \}; `options?`: \{\[`key`: ...\]: ...; `disableConversationVar?`: ...; `disableDefaultAsserts?`: ...; `disableVarExpansion?`: ...; `factuality?`: ...; `postprocess?`: ...; `prefix?`: ...; `provider?`: ...; `rubricPrompt?`: ...; `runSerially?`: ...; `storeOutputAs?`: ...; `suffix?`: ...; `transform?`: ...; `transformVars?`: ...; \}; `prompts?`: ...[]; `provider?`: `string` \| \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \} \| \{ `callApi`: ...; `callClassificationApi?`: ...; `callEmbeddingApi?`: ...; `config?`: ...; `delay?`: ...; `id`: ...; `inputs?`: ...; `label?`: ...; `transform?`: ...; \}; `providerOutput?`: `string` \| `Record`\<..., ...\>; `providers?`: ...[]; `threshold?`: `number`; `vars?`: [`Vars`](../type-aliases/Vars.md); \}; `derivedMetrics?`: `object`[]; `description?`: `string`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \} \| `Record`\<`string`, `string`\>; `evaluateOptions?`: \{ `cache?`: `boolean`; `delay?`: `number`; `eventSource?`: `string`; `filterRange?`: `string`; `generateSuggestions?`: `boolean`; `interactiveProviders?`: `boolean`; `isRedteam?`: `boolean`; `maxConcurrency?`: `number`; `maxEvalTimeMs?`: `number`; `progressCallback?`: (`completed`, `total`, `index`, `evalStep`, `metrics`) => ...; `repeat?`: `number`; `showProgressBar?`: `boolean`; `silent?`: `boolean`; `timeoutMs?`: `number`; \}; `extensions?`: `string`[] \| `null`; `metadata?`: `Record`\<`string`, `any`\>; `nunjucksFilters?`: `Record`\<`string`, `string`\>; `outputPath?`: `string` \| `string`[]; `prompts`: `string` \| `Record`\<`string`, `string`\> \| (`string` \| \{ `config?`: ...; `display?`: ...; `function?`: ...; `id?`: ...; `label`: ...; `raw`: ...; `template?`: ...; \} \| \{ `id`: ...; `label?`: ...; `raw?`: ...; \})[]; `providers?`: `string` \| [`CallApiFunction`](../type-aliases/CallApiFunction.md) & `object` \| (`string` \| ... & ... \| \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \} \| `Record`\<..., ...\>)[]; `redteam?`: [`RedteamFileConfig`](../interfaces/RedteamFileConfig.md); `scenarios?`: (`string` \| \{ `config`: ...; `description?`: ...; `tests`: ...; \})[]; `sharing?`: `boolean` \| \{ `apiBaseUrl?`: `string`; `appBaseUrl?`: `string`; \}; `tags?`: `Record`\<`string`, `string`\>; `targets?`: `string` \| [`CallApiFunction`](../type-aliases/CallApiFunction.md) & `object` \| (`string` \| ... & ... \| \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \} \| `Record`\<..., ...\>)[]; `tests?`: `string` \| \{ `config?`: `Record`\<..., ...\>; `path`: `string`; \} \| (`string` \| \{ `assert?`: ...; `assertScoringFunction?`: ...; `description?`: ...; `metadata?`: ...; `options?`: ...; `prompts?`: ...; `provider?`: ...; `providerOutput?`: ...; `providers?`: ...; `threshold?`: ...; `vars?`: ...; \} \| \{ `config?`: ...; `path`: ...; \})[]; `tracing?`: \{ `enabled`: `boolean`; `forwarding?`: \{ `enabled`: ...; `endpoint`: ...; `headers?`: ...; \}; `otlp?`: \{ `grpc?`: ...; `http?`: ...; \}; `storage?`: \{ `retentionDays`: ...; `type`: ...; \}; \}; `writeLatestResults?`: `boolean`; \}\> \| `null`\>

#### redteam.Graders

> **Graders**: `Record`\<`` `promptfoo:redteam:${string}` ``, `RedteamGraderBase`\> = `GRADERS`

#### redteam.Plugins

> **Plugins**: `PluginFactory`[]

#### redteam.run

> **run**: (`options`) => `Promise`\<`Eval` \| `undefined`\> = `doRedteamRun`

##### Parameters

###### options

[`RedteamRunOptions`](../interfaces/RedteamRunOptions.md)

##### Returns

`Promise`\<`Eval` \| `undefined`\>

#### redteam.Strategies

> **Strategies**: `Strategy`[]
