[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptWithMetadata

# Interface: PromptWithMetadata

Defined in: [types/index.ts:338](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L338)

## Properties

### count

> **count**: `number`

Defined in: [types/index.ts:348](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L348)

---

### evals

> **evals**: `object`[]

Defined in: [types/index.ts:343](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L343)

#### datasetId

> **datasetId**: `string`

#### id

> **id**: `string`

#### metrics

> **metrics**: \{ `assertFailCount`: `number`; `assertPassCount`: `number`; `cost`: `number`; `namedScores`: `Record`\<`string`, `number`\>; `namedScoresCount`: `Record`\<`string`, `number`\>; `namedScoreWeights?`: `Record`\<`string`, `number`\>; `redteam?`: \{ `pluginFailCount`: `Record`\<`string`, `number`\>; `pluginPassCount`: `Record`\<`string`, `number`\>; `strategyFailCount`: `Record`\<`string`, `number`\>; `strategyPassCount`: `Record`\<`string`, `number`\>; \}; `score`: `number`; `testErrorCount`: `number`; `testFailCount`: `number`; `testPassCount`: `number`; `tokenUsage`: \{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `totalLatencyMs`: `number`; \} \| `undefined`

---

### id

> **id**: `string`

Defined in: [types/index.ts:339](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L339)

---

### prompt

> **prompt**: [`Prompt`](Prompt.md)

Defined in: [types/index.ts:340](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L340)

---

### recentEvalDate

> **recentEvalDate**: `Date`

Defined in: [types/index.ts:341](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L341)

---

### recentEvalId

> **recentEvalId**: `string`

Defined in: [types/index.ts:342](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L342)
