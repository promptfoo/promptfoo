[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateOptions

# Interface: EvaluateOptions

Defined in: [types/index.ts:339](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L339)

Runtime-only options accepted by `evaluate()`.

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [types/index.ts:343](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L343)

Signal used to cancel the eval and pass cancellation through to providers.

---

### cache?

> `optional` **cache?**: `boolean`

Defined in: [types/index.ts:267](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L267)

Whether to reuse cached provider responses during the eval.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/index.ts:271](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L271)

Delay in milliseconds between provider calls.

---

### filterRange?

> `optional` **filterRange?**: `string` = `FilterRangeSchema`

Defined in: [types/index.ts:331](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L331)

Zero-based test index range in start:end format (end exclusive).
Persisted on the eval record so resume runs reproduce the original slice.

---

### generateSuggestions?

> `optional` **generateSuggestions?**: `boolean`

Defined in: [types/index.ts:272](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L272)

---

### ~~interactiveProviders?~~

> `optional` **interactiveProviders?**: `boolean`

Defined in: [types/index.ts:279](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L279)

#### Deprecated

This option has been removed as of 2024-08-21.

#### Remarks

Use `maxConcurrency: 1` or the CLI option `-j 1` instead to run evaluations serially.

#### Author

mldangelo

---

### isRedteam?

> `optional` **isRedteam?**: `boolean`

Defined in: [types/index.ts:321](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L321)

Marks the eval as a red team run for downstream behavior and reporting.

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [types/index.ts:283](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L283)

Maximum number of provider calls to run concurrently.

---

### maxEvalTimeMs?

> `optional` **maxEvalTimeMs?**: `number`

Defined in: [types/index.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L317)

Maximum total runtime in milliseconds for the entire evaluation process.
When reached, all remaining tests are marked as errors and the evaluation ends.
Default is 0 (no limit).

---

### progressCallback?

> `optional` **progressCallback?**: (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`

Defined in: [types/index.ts:287](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L287)

Callback invoked as rows finish during evaluation.

#### Parameters

##### completed

`number`

##### total

`number`

##### index

`number`

##### evalStep

`RunEvalOptions`

##### metrics

###### assertFailCount

`number` = `...`

###### assertPassCount

`number` = `...`

###### cost

`number` = `...`

###### namedScores

`Record`\<`string`, `number`\> = `...`

###### namedScoresCount

`Record`\<`string`, `number`\> = `...`

###### namedScoreWeights?

`Record`\<`string`, `number`\> = `...`

###### redteam?

\{ `pluginFailCount`: `Record`\<`string`, `number`\>; `pluginPassCount`: `Record`\<`string`, `number`\>; `strategyFailCount`: `Record`\<`string`, `number`\>; `strategyPassCount`: `Record`\<`string`, `number`\>; \} = `...`

###### redteam.pluginFailCount

`Record`\<`string`, `number`\> = `...`

###### redteam.pluginPassCount

`Record`\<`string`, `number`\> = `...`

###### redteam.strategyFailCount

`Record`\<`string`, `number`\> = `...`

###### redteam.strategyPassCount

`Record`\<`string`, `number`\> = `...`

###### score

`number` = `...`

###### testErrorCount

`number` = `...`

###### testFailCount

`number` = `...`

###### testPassCount

`number` = `...`

###### tokenUsage

\{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \} = `BaseTokenUsageSchema`

###### tokenUsage.assertions?

\{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \} = `...`

###### tokenUsage.assertions.cached?

`number` = `...`

###### tokenUsage.assertions.completion?

`number` = `...`

###### tokenUsage.assertions.completionDetails?

\{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \} = `...`

###### tokenUsage.assertions.completionDetails.acceptedPrediction?

`number` = `...`

###### tokenUsage.assertions.completionDetails.cacheCreationInputTokens?

`number` = `...`

###### tokenUsage.assertions.completionDetails.cacheReadInputTokens?

`number` = `...`

###### tokenUsage.assertions.completionDetails.reasoning?

`number` = `...`

###### tokenUsage.assertions.completionDetails.rejectedPrediction?

`number` = `...`

###### tokenUsage.assertions.numRequests?

`number` = `...`

###### tokenUsage.assertions.prompt?

`number` = `...`

###### tokenUsage.assertions.total?

`number` = `...`

###### tokenUsage.cached?

`number` = `...`

###### tokenUsage.completion?

`number` = `...`

###### tokenUsage.completionDetails?

\{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \} = `...`

###### tokenUsage.completionDetails.acceptedPrediction?

`number` = `...`

###### tokenUsage.completionDetails.cacheCreationInputTokens?

`number` = `...`

###### tokenUsage.completionDetails.cacheReadInputTokens?

`number` = `...`

###### tokenUsage.completionDetails.reasoning?

`number` = `...`

###### tokenUsage.completionDetails.rejectedPrediction?

`number` = `...`

###### tokenUsage.numRequests?

`number` = `...`

###### tokenUsage.prompt?

`number` = `...`

###### tokenUsage.total?

`number` = `...`

###### totalLatencyMs

`number` = `...`

#### Returns

`void`

---

### repeat?

> `optional` **repeat?**: `number`

Defined in: [types/index.ts:301](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L301)

Number of times to repeat each test case.

---

### showProgressBar?

> `optional` **showProgressBar?**: `boolean`

Defined in: [types/index.ts:305](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L305)

Whether CLI-oriented callers should render a progress bar.

---

### silent?

> `optional` **silent?**: `boolean`

Defined in: [types/index.ts:326](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L326)

When true, suppresses informational output like "Starting evaluation" messages.
Useful for internal evaluations like provider validation.

---

### suggestionsCount?

> `optional` **suggestionsCount?**: `number`

Defined in: [types/index.ts:273](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L273)

---

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [types/index.ts:311](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L311)

Timeout in milliseconds for each individual test case/provider API call.
When reached, that specific test is marked as an error.
Default is 0 (no timeout).
