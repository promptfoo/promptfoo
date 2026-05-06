---
title: 'Interface: CompletionTokenDetails'
description: 'Detailed completion-token breakdown reported by reasoning-capable models.'
---

## Import

```ts
import type { CompletionTokenDetails } from 'promptfoo';
```

Defined in: [types/shared.ts:42](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L42)

Detailed completion-token breakdown reported by reasoning-capable models.

## Example

```ts
const details: CompletionTokenDetails = {
  reasoning: 32,
  cacheReadInputTokens: 128,
};
```

## Properties

### acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Defined in: [types/shared.ts:46](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L46)

Prediction tokens accepted by speculative decoding, when reported.

---

### cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Defined in: [types/shared.ts:52](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L52)

Input tokens written into a provider cache.

---

### cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Defined in: [types/shared.ts:50](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L50)

Input tokens read from a provider cache.

---

### reasoning?

> `optional` **reasoning?**: `number`

Defined in: [types/shared.ts:44](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L44)

Tokens spent on hidden model reasoning when the provider reports them.

---

### rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Defined in: [types/shared.ts:48](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L48)

Prediction tokens rejected by speculative decoding, when reported.
