[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateSummaryV3

# Interface: EvaluateSummaryV3

Defined in: [types/index.ts:466](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L466)

## Properties

### prompts

> **prompts**: `object`[]

Defined in: [types/index.ts:470](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L470)

#### config?

> `optional` **config?**: `any`

#### ~~display?~~

> `optional` **display?**: `string`

##### Deprecated

in > 0.59.0. Use `label` instead.

#### function?

> `optional` **function?**: [`PromptFunction`](PromptFunction.md)

#### id?

> `optional` **id?**: `string`

#### label

> **label**: `string`

#### metrics?

> `optional` **metrics?**: `object`

##### metrics.assertFailCount

> **assertFailCount**: `number`

##### metrics.assertPassCount

> **assertPassCount**: `number`

##### metrics.cost

> **cost**: `number`

##### metrics.namedScores

> **namedScores**: `Record`\<`string`, `number`\>

##### metrics.namedScoresCount

> **namedScoresCount**: `Record`\<`string`, `number`\>

##### metrics.namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

##### metrics.redteam?

> `optional` **redteam?**: `object`

##### metrics.redteam.pluginFailCount

> **pluginFailCount**: `Record`\<`string`, `number`\>

##### metrics.redteam.pluginPassCount

> **pluginPassCount**: `Record`\<`string`, `number`\>

##### metrics.redteam.strategyFailCount

> **strategyFailCount**: `Record`\<`string`, `number`\>

##### metrics.redteam.strategyPassCount

> **strategyPassCount**: `Record`\<`string`, `number`\>

##### metrics.score

> **score**: `number`

##### metrics.testErrorCount

> **testErrorCount**: `number`

##### metrics.testFailCount

> **testFailCount**: `number`

##### metrics.testPassCount

> **testPassCount**: `number`

##### metrics.tokenUsage

> **tokenUsage**: `object` = `BaseTokenUsageSchema`

##### metrics.tokenUsage.assertions?

> `optional` **assertions?**: `object`

##### metrics.tokenUsage.assertions.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.assertions.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

##### metrics.tokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### metrics.tokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### metrics.tokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### metrics.tokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

##### metrics.tokenUsage.assertions.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.assertions.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.assertions.total?

> `optional` **total?**: `number`

##### metrics.tokenUsage.cached?

> `optional` **cached?**: `number`

##### metrics.tokenUsage.completion?

> `optional` **completion?**: `number`

##### metrics.tokenUsage.completionDetails?

> `optional` **completionDetails?**: `object`

##### metrics.tokenUsage.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

##### metrics.tokenUsage.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### metrics.tokenUsage.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### metrics.tokenUsage.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### metrics.tokenUsage.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

##### metrics.tokenUsage.numRequests?

> `optional` **numRequests?**: `number`

##### metrics.tokenUsage.prompt?

> `optional` **prompt?**: `number`

##### metrics.tokenUsage.total?

> `optional` **total?**: `number`

##### metrics.totalLatencyMs

> **totalLatencyMs**: `number`

#### provider

> **provider**: `string`

#### raw

> **raw**: `string`

#### template?

> `optional` **template?**: `string`

---

### results

> **results**: [`EvaluateResult`](EvaluateResult.md)[]

Defined in: [types/index.ts:469](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L469)

---

### stats

> **stats**: [`EvaluateStats`](EvaluateStats.md)

Defined in: [types/index.ts:471](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L471)

---

### timestamp

> **timestamp**: `string`

Defined in: [types/index.ts:468](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L468)

---

### version

> **version**: `3`

Defined in: [types/index.ts:467](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L467)
