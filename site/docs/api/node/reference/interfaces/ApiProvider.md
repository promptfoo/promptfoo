[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:181](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L181)

Provider object shape accepted by the Node.js API.

## Properties

### callApi

> **callApi**: [`CallApiFunction`](CallApiFunction.md)

Defined in: [types/providers.ts:185](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L185)

Execute one provider request.

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>

Defined in: [types/providers.ts:187](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L187)

Optional classification-specific entrypoint for compatible providers.

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<`ProviderClassificationResponse`\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<`ProviderEmbeddingResponse`\>

Defined in: [types/providers.ts:189](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L189)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`ProviderEmbeddingResponse`\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:219](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L219)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:196](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L196)

Provider-specific configuration retained for later calls and serialization.
The shape mirrors [ProviderOptions.config](ProviderOptions.md#config); consult the documentation
for the specific provider for the supported keys.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:198](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L198)

Delay in milliseconds before provider calls.

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:200](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L200)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:183](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L183)

Stable id used in result tables, cache keys, and provider lookups.

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:202](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L202)

Named provider inputs used by multi-input targets.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:204](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L204)

Human-readable label shown in reports.

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:213](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L213)

Custom JSON serialization hook used when persisting the provider on an eval
record. Implementations should return a value that is structurally
serializable (no functions or circular references).

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:206](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L206)

Transform provider output before assertions run.
