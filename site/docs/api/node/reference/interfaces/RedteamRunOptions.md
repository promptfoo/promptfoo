[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamRunOptions

# Interface: RedteamRunOptions

Defined in: [redteam/types.ts:308](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L308)

**`Beta`**

Runtime options accepted by `redteam.run()`.

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [redteam/types.ts:364](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L364)

**`Beta`**

Signal used to cancel the run.

---

### cache?

> `optional` **cache?**: `boolean`

Defined in: [redteam/types.ts:318](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L318)

**`Beta`**

Whether to reuse cached provider responses.

---

### config?

> `optional` **config?**: `string`

Defined in: [redteam/types.ts:312](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L312)

**`Beta`**

Path to the red team config file to execute.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [redteam/types.ts:324](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L324)

**`Beta`**

Delay in milliseconds between provider calls.

---

### description?

> `optional` **description?**: `string`

Defined in: [redteam/types.ts:340](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L340)

**`Beta`**

Human-readable description recorded with the run.

---

### envPath?

> `optional` **envPath?**: `string`

Defined in: [redteam/types.ts:320](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L320)

**`Beta`**

Path to an environment file loaded before the run.

---

### filterPrompts?

> `optional` **filterPrompts?**: `string`

Defined in: [redteam/types.ts:330](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L330)

**`Beta`**

Prompt filter expression applied before execution.

---

### filterProviders?

> `optional` **filterProviders?**: `string`

Defined in: [redteam/types.ts:332](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L332)

**`Beta`**

Provider filter expression applied before execution.

---

### filterTargets?

> `optional` **filterTargets?**: `string`

Defined in: [redteam/types.ts:334](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L334)

**`Beta`**

Target filter expression applied before execution.

---

### force?

> `optional` **force?**: `boolean`

Defined in: [redteam/types.ts:328](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L328)

**`Beta`**

Whether to bypass prompts that normally ask for confirmation.

---

### id?

> `optional` **id?**: `string`

Defined in: [redteam/types.ts:310](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L310)

**`Beta`**

Stable eval id to reuse or attach to the run.

---

### liveRedteamConfig?

> `optional` **liveRedteamConfig?**: `any`

Defined in: [redteam/types.ts:349](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L349)

**`Beta`**

Live config payload used by the web UI flow. The payload is opaque to the
Node.js API and is forwarded to the run unchanged.

---

### loadedFromCloud?

> `optional` **loadedFromCloud?**: `boolean`

Defined in: [redteam/types.ts:367](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L367)

**`Beta`**

Whether the config originated from Promptfoo Cloud.

---

### logCallback?

> `optional` **logCallback?**: (`message`) => `void`

Defined in: [redteam/types.ts:351](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L351)

**`Beta`**

Optional callback for runtime log messages.

#### Parameters

##### message

`string`

#### Returns

`void`

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [redteam/types.ts:322](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L322)

**`Beta`**

Maximum number of provider calls to execute concurrently.

---

### output?

> `optional` **output?**: `string`

Defined in: [redteam/types.ts:316](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L316)

**`Beta`**

Optional output path for generated artifacts.

---

### progressBar?

> `optional` **progressBar?**: `boolean`

Defined in: [redteam/types.ts:338](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L338)

**`Beta`**

Whether to render a progress bar.

---

### progressCallback?

> `optional` **progressCallback?**: (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`

Defined in: [redteam/types.ts:356](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L356)

**`Beta`**

Callback invoked as red team results complete. `evalStep` and `metrics`
mirror the [EvaluateOptions.progressCallback](EvaluateOptions.md#progresscallback) arguments.

#### Parameters

##### completed

`number`

##### total

`number`

##### index

`string` \| `number`

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

### remote?

> `optional` **remote?**: `boolean`

Defined in: [redteam/types.ts:326](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L326)

**`Beta`**

Whether to execute against a remote Promptfoo target.

---

### strict?

> `optional` **strict?**: `boolean`

Defined in: [redteam/types.ts:342](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L342)

**`Beta`**

Whether to fail closed on invalid or partial runtime input.

---

### target?

> `optional` **target?**: `string`

Defined in: [redteam/types.ts:314](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L314)

**`Beta`**

Target selector passed through to the run.

---

### verbose?

> `optional` **verbose?**: `boolean`

Defined in: [redteam/types.ts:336](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L336)

**`Beta`**

Whether to emit verbose runtime logging.
