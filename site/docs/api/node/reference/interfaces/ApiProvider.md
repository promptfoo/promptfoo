---
title: 'Interface: ApiProvider'
description: 'Provider object shape accepted by the Node.js API. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 1
---

## Import

```ts
import type { ApiProvider } from 'promptfoo';
```

Defined in: [src/types/providers.ts:281](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L281)

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

Defined in: [src/types/providers.ts:283](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L283)

Execute one provider request.

#### Overrides

`MinimalApiProvider.callApi`

---

### cleanup?

<!-- prettier-ignore -->
> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [src/types/providers.ts:335](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L335)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [src/types/providers.ts:304](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L304)

Provider-specific configuration retained for later calls and serialization.
The shape mirrors [ProviderOptions.config](ProviderOptions.md#config); consult the documentation
for the specific provider for the supported keys.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [src/types/providers.ts:306](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L306)

Delay in milliseconds before provider calls.

---

### getAudioInputFormat?

> `optional` **getAudioInputFormat?**: () => `"openai"` \| `"google"` \| `undefined`

Defined in: [src/types/providers.ts:310](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L310)

Native audio input content format accepted by this provider and its configured model.

#### Returns

`"openai"` \| `"google"` \| `undefined`

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [src/types/providers.ts:308](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L308)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [src/contracts/prompts.ts:5](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L5)

#### Returns

`string`

#### Inherited from

`MinimalApiProvider.id`

---

### inputs?

<!-- prettier-ignore -->
> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [src/types/providers.ts:318](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L318)

Named provider inputs used by multi-input targets.

Each key is the variable name. Use a short description string for simple
text inputs, or an object when the input needs a declared media type or
generation guidance.

---

### label?

> `optional` **label?**: `string`

Defined in: [src/types/providers.ts:320](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L320)

Human-readable label shown in reports.

#### Overrides

`MinimalApiProvider.label`

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [src/types/providers.ts:329](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L329)

Custom JSON serialization hook used when persisting the provider on an eval
record. Implementations should return a value that is structurally
serializable (no functions or circular references).

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [src/types/providers.ts:322](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L322)

Transform provider output before assertions run.

## Methods

### callClassificationApi()?

<!-- prettier-ignore -->
> `optional` **callClassificationApi**(`prompt`): `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

Defined in: [src/types/providers.ts:290](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L290)

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

<!-- prettier-ignore -->
> `optional` **callEmbeddingApi**(`input`): `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Defined in: [src/types/providers.ts:297](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L297)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

Text to embed.

#### Returns

`Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Embedding vector plus any provider-reported metadata.
