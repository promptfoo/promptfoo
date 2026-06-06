---
title: 'Interface: ApiProvider'
description: 'Provider object shape accepted by the Node.js API.'
---

## Import

```ts
import type { ApiProvider } from 'promptfoo';
```

Defined in: [types/providers.ts:274](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L274)

Provider object shape accepted by the Node.js API.

Start with `ProviderFunction` for a simple text-only integration. Implement
`ApiProvider` when the provider needs a stable id, lifecycle hooks, or extra
methods for embeddings, similarity, classification, or moderation.

## Example

```ts
const provider: ApiProvider = {
  id: () => 'custom:echo',
  label: 'echo',
  callApi: async (prompt) => ({ output: `Echo: ${prompt}` }),
};
```

## Extends

- `MinimalApiProvider`

## Properties

### callApi

> **callApi**: [`CallApiFunction`](CallApiFunction.md)

Defined in: [types/providers.ts:276](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L276)

Execute one provider request.

#### Overrides

`MinimalApiProvider.callApi`

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:326](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L326)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:297](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L297)

Provider-specific configuration retained for later calls and serialization.
The shape mirrors [ProviderOptions.config](ProviderOptions.md#config); consult the documentation
for the specific provider for the supported keys.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:299](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L299)

Delay in milliseconds before provider calls.

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:301](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L301)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [contracts/prompts.ts:5](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L5)

#### Returns

`string`

#### Inherited from

`MinimalApiProvider.id`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:309](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L309)

Named provider inputs used by multi-input targets.

Each key is the variable name. Use a short description string for simple
text inputs, or an object when the input needs a declared media type or
generation guidance.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:311](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L311)

Human-readable label shown in reports.

#### Overrides

`MinimalApiProvider.label`

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:320](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L320)

Custom JSON serialization hook used when persisting the provider on an eval
record. Implementations should return a value that is structurally
serializable (no functions or circular references).

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:313](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L313)

Transform provider output before assertions run.

## Methods

### callClassificationApi()?

> `optional` **callClassificationApi**(`prompt`): `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

Defined in: [types/providers.ts:283](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L283)

Optional classification-specific entrypoint for compatible providers.

#### Parameters

##### prompt

`string`

Text to classify.

#### Returns

`Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

Class labels mapped to provider-reported scores.

---

### callEmbeddingApi()?

> `optional` **callEmbeddingApi**(`input`): `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Defined in: [types/providers.ts:290](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L290)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

Text to embed.

#### Returns

`Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Embedding vector plus any provider-reported metadata.
