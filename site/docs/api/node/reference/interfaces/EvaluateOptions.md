[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateOptions

# Interface: EvaluateOptions

Defined in: [types/index.ts:335](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L335)

Runtime-only options accepted by `evaluate()`.

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [types/index.ts:339](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L339)

Signal used to cancel the eval and pass cancellation through to providers.

---

### cache?

> `optional` **cache?**: `boolean`

Defined in: [types/index.ts:257](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L257)

Whether to reuse cached provider responses during the eval.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/index.ts:261](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L261)

Delay in milliseconds between provider calls.

---

### eventSource?

> `optional` **eventSource?**: `string`

Defined in: [types/index.ts:265](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L265)

Optional label recorded with the eval for telemetry and downstream reporting.

---

### filterRange?

> `optional` **filterRange?**: `string` = `FilterRangeSchema`

Defined in: [types/index.ts:327](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L327)

Zero-based test index range in start:end format (end exclusive).
Persisted on the eval record so resume runs reproduce the original slice.

---

### generateSuggestions?

> `optional` **generateSuggestions?**: `boolean`

Defined in: [types/index.ts:269](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L269)

Whether to generate follow-up suggestions after the eval completes.

---

### ~~interactiveProviders?~~

> `optional` **interactiveProviders?**: `boolean`

Defined in: [types/index.ts:275](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L275)

#### Deprecated

This option has been removed as of 2024-08-21.

#### Remarks

Use `maxConcurrency: 1` or the CLI option `-j 1` instead to run evaluations serially.

#### Author

mldangelo

---

### isRedteam?

> `optional` **isRedteam?**: `boolean`

Defined in: [types/index.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L317)

Marks the eval as a red team run for downstream behavior and reporting.

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [types/index.ts:279](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L279)

Maximum number of provider calls to run concurrently.

---

### maxEvalTimeMs?

> `optional` **maxEvalTimeMs?**: `number`

Defined in: [types/index.ts:313](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L313)

Maximum total runtime in milliseconds for the entire evaluation process.
When reached, all remaining tests are marked as errors and the evaluation ends.
Default is 0 (no limit).

---

### progressCallback?

> `optional` **progressCallback?**: (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`

Defined in: [types/index.ts:283](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L283)

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

Defined in: [types/index.ts:297](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L297)

Number of times to repeat each test case.

---

### showProgressBar?

> `optional` **showProgressBar?**: `boolean`

Defined in: [types/index.ts:301](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L301)

Whether CLI-oriented callers should render a progress bar.

---

### silent?

> `optional` **silent?**: `boolean`

Defined in: [types/index.ts:322](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L322)

When true, suppresses informational output like "Starting evaluation" messages.
Useful for internal evaluations like provider validation.

---

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [types/index.ts:307](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L307)

Timeout in milliseconds for each individual test case/provider API call.
When reached, that specific test is marked as an error.
Default is 0 (no timeout).
