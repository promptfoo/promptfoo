[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / assertions

# Variable: assertions

> **assertions**: `object`

Defined in: [assertions/index.ts:932](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L932)

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

Arbitrary custom config exposed to assertion callbacks through `context.config`.

###### contextTransform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

Extract assertion-specific context from output before grading.

###### metric?

`string` = `...`

Optional metric name used when the assertion contributes a named score.

###### provider?

`any` = `...`

Provider override used by model-graded assertions that need one.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric override used by model-graded assertions.

###### threshold?

`number` = `...`

Minimum score required by threshold-aware assertions such as `similar`.

###### transform?

`string` \| [`TransformFunction`](../type-aliases/TransformFunction.md) = `...`

Transform provider output before this assertion runs.

###### type

`"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

Assertion kind to run, such as `contains`, `javascript`, or `llm-rubric`.

###### value?

`AssertionValue` = `...`

Expected value or callback consumed by assertion types that need one.

###### weight?

`number` = `...`

Weight of this assertion relative to the rest of the test case. Defaults to `1`.

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

[`RunAssertionOptions`](../interfaces/RunAssertionOptions.md)

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

#### Example

```ts
import { assertions } from 'promptfoo';

const result = await assertions.runAssertion({
  assertion: { type: 'contains', value: 'Ada' },
  test: { vars: {} },
  providerResponse: { output: 'Hello Ada' },
});

console.log(result.pass);
```

### runAssertions

> **runAssertions**: (`__namedParameters`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Run all assertions for one test case and aggregate the grading result.

This is the supported batch counterpart to `runAssertion()` for advanced
callers that already have a provider response and test case in hand.

#### Parameters

##### \_\_namedParameters

[`RunAssertionsOptions`](../interfaces/RunAssertionsOptions.md)

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

#### Example

```ts
import { assertions } from 'promptfoo';

const result = await assertions.runAssertions({
  test: {
    vars: {},
    assert: [
      { type: 'contains', value: 'Ada' },
      { type: 'word-count', value: 2 },
    ],
  },
  providerResponse: { output: 'Hello Ada' },
});

console.log(result.pass, result.score);
```
