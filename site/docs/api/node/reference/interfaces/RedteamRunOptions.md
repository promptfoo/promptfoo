[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamRunOptions

# Interface: RedteamRunOptions

Defined in: [redteam/types.ts:309](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L309)

**`Beta`**

Runtime options accepted by `redteam.run()`.

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [redteam/types.ts:365](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L365)

**`Beta`**

Signal used to cancel the run.

---

### cache?

> `optional` **cache?**: `boolean`

Defined in: [redteam/types.ts:319](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L319)

**`Beta`**

Whether to reuse cached provider responses.

---

### config?

> `optional` **config?**: `string`

Defined in: [redteam/types.ts:313](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L313)

**`Beta`**

Path to the red team config file to execute.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [redteam/types.ts:325](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L325)

**`Beta`**

Delay in milliseconds between provider calls.

---

### description?

> `optional` **description?**: `string`

Defined in: [redteam/types.ts:341](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L341)

**`Beta`**

Human-readable description recorded with the run.

---

### envPath?

> `optional` **envPath?**: `string`

Defined in: [redteam/types.ts:321](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L321)

**`Beta`**

Path to an environment file loaded before the run.

---

### eventSource?

> `optional` **eventSource?**: `"default"` \| `"mcp"` \| `"cli"` \| `"library"` \| `"web"`

Defined in: [redteam/types.ts:369](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L369)

**`Beta`**

---

### filterPrompts?

> `optional` **filterPrompts?**: `string`

Defined in: [redteam/types.ts:331](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L331)

**`Beta`**

Prompt filter expression applied before execution.

---

### filterProviders?

> `optional` **filterProviders?**: `string`

Defined in: [redteam/types.ts:333](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L333)

**`Beta`**

Provider filter expression applied before execution.

---

### filterTargets?

> `optional` **filterTargets?**: `string`

Defined in: [redteam/types.ts:335](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L335)

**`Beta`**

Target filter expression applied before execution.

---

### force?

> `optional` **force?**: `boolean`

Defined in: [redteam/types.ts:329](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L329)

**`Beta`**

Whether to bypass prompts that normally ask for confirmation.

---

### id?

> `optional` **id?**: `string`

Defined in: [redteam/types.ts:311](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L311)

**`Beta`**

Stable eval id to reuse or attach to the run.

---

### liveRedteamConfig?

> `optional` **liveRedteamConfig?**: `any`

Defined in: [redteam/types.ts:350](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L350)

**`Beta`**

Live config payload used by the web UI flow. The payload is opaque to the
Node.js API and is forwarded to the run unchanged.

---

### loadedFromCloud?

> `optional` **loadedFromCloud?**: `boolean`

Defined in: [redteam/types.ts:368](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L368)

**`Beta`**

Whether the config originated from Promptfoo Cloud.

---

### logCallback?

> `optional` **logCallback?**: (`message`) => `void`

Defined in: [redteam/types.ts:352](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L352)

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

Defined in: [redteam/types.ts:323](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L323)

**`Beta`**

Maximum number of provider calls to execute concurrently.

---

### output?

> `optional` **output?**: `string`

Defined in: [redteam/types.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L317)

**`Beta`**

Optional output path for generated artifacts.

---

### progressBar?

> `optional` **progressBar?**: `boolean`

Defined in: [redteam/types.ts:339](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L339)

**`Beta`**

Whether to render a progress bar.

---

### progressCallback?

> `optional` **progressCallback?**: (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`

Defined in: [redteam/types.ts:357](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L357)

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

`any`

##### metrics

`any`

#### Returns

`void`

---

### remote?

> `optional` **remote?**: `boolean`

Defined in: [redteam/types.ts:327](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L327)

**`Beta`**

Whether to execute against a remote Promptfoo target.

---

### strict?

> `optional` **strict?**: `boolean`

Defined in: [redteam/types.ts:343](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L343)

**`Beta`**

Whether to fail closed on invalid or partial runtime input.

---

### target?

> `optional` **target?**: `string`

Defined in: [redteam/types.ts:315](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L315)

**`Beta`**

Target selector passed through to the run.

---

### verbose?

> `optional` **verbose?**: `boolean`

Defined in: [redteam/types.ts:337](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L337)

**`Beta`**

Whether to emit verbose runtime logging.
