[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ResultsFile

# Interface: ResultsFile

Defined in: [types/index.ts:1338](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1338)

## Properties

### author

> **author**: `string` \| `null`

Defined in: [types/index.ts:1343](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1343)

---

### config

> **config**: `Partial`\<[`UnifiedConfig`](../type-aliases/UnifiedConfig.md)\>

Defined in: [types/index.ts:1342](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1342)

---

### createdAt

> **createdAt**: `string`

Defined in: [types/index.ts:1340](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1340)

---

### datasetId?

> `optional` **datasetId?**: `string` \| `null`

Defined in: [types/index.ts:1346](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1346)

---

### prompts?

> `optional` **prompts?**: `object`[]

Defined in: [types/index.ts:1344](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1344)

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

> `optional` **acceptedPrediction?**: ... \| ...

##### metrics.tokenUsage.assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: ... \| ...

##### metrics.tokenUsage.assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: ... \| ...

##### metrics.tokenUsage.assertions.completionDetails.reasoning?

> `optional` **reasoning?**: ... \| ...

##### metrics.tokenUsage.assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: ... \| ...

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

> **results**: [`EvaluateSummaryV3`](EvaluateSummaryV3.md) \| [`EvaluateSummaryV2`](EvaluateSummaryV2.md)

Defined in: [types/index.ts:1341](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1341)

---

### version

> **version**: `number`

Defined in: [types/index.ts:1339](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1339)
