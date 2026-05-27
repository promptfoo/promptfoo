---
title: 'Variable: assertions'
description: 'Assertion helpers exposed through the Node.js package.'
---

## Import

```ts
import { assertions } from 'promptfoo';
```

> **assertions**: `object`

Defined in: [assertions/index.ts:949](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L949)

Assertion helpers exposed through the Node.js package.

`runAssertion()` and `runAssertions()` are the supported low-level execution
hooks. The matcher helpers are also public and are useful when integrating
promptfoo with test frameworks such as Jest or Vitest.

## Type Declaration

### matchesAnswerRelevance

> **matchesAnswerRelevance**: (`input`, `output`, `threshold`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Score how relevant a generated answer is to the original input question.

#### Parameters

##### input

`string`

Original user question or prompt.

##### output

`string`

Model answer to grade.

##### threshold

`number`

Minimum average relevance score required to pass.

##### grading?

Optional provider and rubric overrides.

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

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Relevance grading result without the surrounding assertion payload.

### matchesClassification

> **matchesClassification**: (`expected`, `output`, `threshold`, `grading?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Score whether provider classification output meets a threshold.

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

Provider and rubric overrides for the classifier.

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

Grade whether an answer satisfies a closed-QA criterion.

#### Parameters

##### input

`string`

Original prompt or question.

##### expected

`string`

Criterion or expected answer the output should satisfy.

##### output

`string`

Model answer to grade.

##### grading?

Provider and rubric-prompt overrides for the grader.

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

Template variables available while rendering custom rubrics.

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Closed-QA grading result without the surrounding assertion payload.

### matchesComparisonBoolean

> **matchesComparisonBoolean**: (`criteria`, `outputs`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>[]\> = `matchesSelectBest`

Compare candidate outputs and mark the grader-selected best response.

Exposed as `assertions.matchesComparisonBoolean()` on the public helper object.

#### Parameters

##### criteria

`string`

Rubric describing how to choose the best output.

##### outputs

`string`[]

Candidate outputs to compare.

##### grading?

Optional provider and rubric overrides.

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

Template variables available while rendering custom rubrics.

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>[]\>

One grading result per candidate output, in the original order.

### matchesContextFaithfulness

> **matchesContextFaithfulness**: (`query`, `output`, `context`, `threshold`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Score whether the answer is faithful to the supplied context.

#### Parameters

##### query

`string`

Original question posed to the model.

##### output

`string`

Model answer to grade.

##### context

`string` \| `string`[]

Retrieved context chunks or a serialized context string.

##### threshold

`number`

Minimum faithfulness score required to pass.

##### grading?

Optional provider and rubric overrides.

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

Template variables available while rendering custom rubrics.

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Context-faithfulness grading result without the surrounding assertion payload.

### matchesContextRecall

> **matchesContextRecall**: (`context`, `groundTruth`, `threshold`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Score how much of the ground truth is supported by the supplied context.

#### Parameters

##### context

`string` \| `string`[]

Retrieved context chunks or a serialized context string.

##### groundTruth

`string`

Reference answer whose claims should be attributable.

##### threshold

`number`

Minimum recall score required to pass.

##### grading?

Optional provider and rubric overrides.

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

Template variables available while rendering custom rubrics.

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Context-recall grading result without the surrounding assertion payload.

### matchesContextRelevance

> **matchesContextRelevance**: (`question`, `context`, `threshold`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Score how much of the supplied context is relevant to the question.

#### Parameters

##### question

`string`

Question used to judge whether context is relevant.

##### context

`string` \| `string`[]

Retrieved context chunks or a serialized context string.

##### threshold

`number`

Minimum relevance score required to pass.

##### grading?

Optional provider and rubric overrides.

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

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Context-relevance grading result without the surrounding assertion payload.

### matchesConversationRelevance

> **matchesConversationRelevance**: (`messages`, `threshold`, `vars?`, `grading?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Score whether assistant responses stay relevant across a conversation.

#### Parameters

##### messages

[`ConversationRelevanceMessage`](../interfaces/ConversationRelevanceMessage.md)[]

Ordered user / assistant turns to judge together.

##### threshold

`number`

Minimum score required to pass.

##### vars?

`Record`\<`string`, `VarValue`\>

Template variables available while rendering custom rubrics.

##### grading?

Optional provider and rubric overrides.

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

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Conversation-relevance grading result without the surrounding assertion payload.

### matchesFactuality

> **matchesFactuality**: (`input`, `expected`, `output`, `grading?`, `vars?`, `providerCallContext?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Grade whether an answer is factually consistent with a reference answer.

#### Parameters

##### input

`string`

Original prompt or question.

##### expected

`string`

Reference answer used as the factual baseline.

##### output

`string`

Model answer to grade.

##### grading?

Provider and rubric-prompt overrides for the grader.

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

Template variables available while rendering custom rubrics.

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

Provider context forwarded to grader calls.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Factuality grading result without the surrounding assertion payload.

### matchesLlmRubric

> **matchesLlmRubric**: (`rubric`, `llmOutput`, `grading?`, `vars?`, `assertion?`, `options?`, `providerCallContext?`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Grade an output against a free-form LLM rubric.

#### Parameters

##### rubric

`string` \| `object`

Rubric text or structured rubric payload.

##### llmOutput

`string`

Model output to grade.

##### grading?

Provider and rubric-prompt overrides for the grader.

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

Template variables available while rendering custom rubrics.

##### assertion?

[`Assertion`](../interfaces/Assertion.md)

Assertion metadata to attach to the result, when present.

##### options?

Error-handling and remote-grading preferences.

###### preferRemote?

`boolean`

Prefer remote grading when no explicit provider override is supplied.

###### throwOnError?

`boolean`

Rethrow provider failures instead of converting them into a failed grading result.

##### providerCallContext?

[`CallApiContextParams`](../interfaces/CallApiContextParams.md)

Provider context forwarded to grader calls.

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Grading result for the rubric check.

### matchesModeration

> **matchesModeration**: (`options`, `grading?`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Check a model response with the configured moderation provider.

#### Parameters

##### options

[`ModerationMatchOptions`](../interfaces/ModerationMatchOptions.md)

Prompt, response, and optional category filter.

##### grading?

Optional moderation-provider override.

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

Moderation grading result without the surrounding assertion payload.

### matchesSimilarity

> **matchesSimilarity**: (`expected`, `output`, `threshold`, `inverse`, `grading?`, `metric`) => `Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Compare two texts with an embedding or similarity provider.

#### Parameters

##### expected

`string`

Reference text.

##### output

`string`

Candidate text to compare.

##### threshold

`number`

Minimum similarity required to pass, or maximum distance for Euclidean mode.

##### inverse?

`boolean` = `false`

Invert the pass condition for `not-similar` style checks.

##### grading?

Optional provider override for the matcher.

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

Similarity metric to apply.

#### Returns

`Promise`\<`Omit`\<[`GradingResult`](../interfaces/GradingResult.md), `"assertion"`\>\>

Similarity grading result without the surrounding assertion payload.

### runAssertion

> **runAssertion**: (`options`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Run one assertion against a provider response.

This is the supported low-level hook for advanced callers that want to reuse
promptfoo assertion logic outside a full eval run.

#### Parameters

##### options

[`RunAssertionOptions`](../interfaces/RunAssertionOptions.md)

Assertion, provider response, and supporting runtime context.

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

The grading result for this single assertion.

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

> **runAssertions**: (`options`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

Run all assertions for one test case and aggregate the grading result.

This is the supported batch counterpart to `runAssertion()` for advanced
callers that already have a provider response and test case in hand.

#### Parameters

##### options

[`RunAssertionsOptions`](../interfaces/RunAssertionsOptions.md)

Test case, provider response, and aggregation controls.

#### Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\>

The aggregated grading result for the test case.

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

## Example

```ts
import { assertions } from 'promptfoo';

const result = await assertions.runAssertion({
  assertion: { type: 'contains', value: 'Ada' },
  test: { vars: {} },
  providerResponse: { output: 'Hello Ada' },
});
```
