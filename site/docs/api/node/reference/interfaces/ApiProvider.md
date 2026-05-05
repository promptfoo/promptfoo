[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:169](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L169)

Provider object shape accepted by the Node.js API.

## Properties

### callApi

> **callApi**: [`CallApiFunction`](CallApiFunction.md)

Defined in: [types/providers.ts:173](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L173)

Execute one provider request.

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>

Defined in: [types/providers.ts:175](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L175)

Optional classification-specific entrypoint for compatible providers.

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<`ProviderClassificationResponse`\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<`ProviderEmbeddingResponse`\>

Defined in: [types/providers.ts:177](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L177)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`ProviderEmbeddingResponse`\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:207](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L207)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:184](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L184)

Provider-specific configuration retained for later calls and serialization.
The shape mirrors [ProviderOptions.config](ProviderOptions.md#config); consult the documentation
for the specific provider for the supported keys.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:186](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L186)

Delay in milliseconds before provider calls.

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:188](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L188)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:171](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L171)

Stable id used in result tables, cache keys, and provider lookups.

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:190](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L190)

Named provider inputs used by multi-input targets.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:192](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L192)

Human-readable label shown in reports.

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:201](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L201)

Custom JSON serialization hook used when persisting the provider on an eval
record. Implementations should return a value that is structurally
serializable (no functions or circular references).

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:194](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L194)

Transform provider output before assertions run.
