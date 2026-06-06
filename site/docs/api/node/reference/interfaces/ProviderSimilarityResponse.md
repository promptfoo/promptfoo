---
title: 'Interface: ProviderSimilarityResponse'
description: 'Response returned by similarity-capable providers.'
---

## Import

```ts
import type { ProviderSimilarityResponse } from 'promptfoo';
```

Defined in: [contracts/providers.ts:315](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L315)

Response returned by similarity-capable providers.

## Properties

### error?

> `optional` **error?**: `string`

Defined in: [contracts/providers.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L317)

Error message when the similarity call failed without throwing.

---

### similarity?

> `optional` **similarity?**: `number`

Defined in: [contracts/providers.ts:319](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L319)

Similarity score reported by the provider.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [contracts/providers.ts:321](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L321)

Token usage attributed to the similarity request.
