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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

##### vars?

`Record`\<`string`, `VarValue`\>

##### assertion?

[`Assertion`](../interfaces/Assertion.md)

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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

Score mapping used by factuality-oriented graders.

###### factuality.agree?

`number` = `...`

Score awarded when answer and reference agree factually.

###### factuality.differButFactual?

`number` = `...`

Score awarded when wording differs but remains factual.

###### factuality.disagree?

`number` = `...`

Score awarded when answer and reference disagree factually.

###### factuality.subset?

`number` = `...`

Score awarded when the answer is a factual subset of the expected answer.

###### factuality.superset?

`number` = `...`

Score awarded when the answer is a factual superset of the expected answer.

###### provider?

`any` = `...`

Provider override used by model-graded assertions.

###### rubricPrompt?

`string` \| `string`[] \| `object`[] = `...`

Rubric prompt override used by model-graded assertions.

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
