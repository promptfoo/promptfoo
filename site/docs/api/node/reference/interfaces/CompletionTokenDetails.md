---
title: 'Interface: CompletionTokenDetails'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 14
---

## Import

```ts
import type { CompletionTokenDetails } from 'promptfoo';
```

Defined in: [src/contracts/shared.ts:43](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L43)

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

Defined in: [src/contracts/shared.ts:20](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L20)

Prediction tokens accepted by speculative decoding, when reported.

---

### cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Defined in: [src/contracts/shared.ts:26](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L26)

Input tokens written into a provider cache.

---

### cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Defined in: [src/contracts/shared.ts:24](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L24)

Input tokens read from a provider cache.

---

### reasoning?

> `optional` **reasoning?**: `number`

Defined in: [src/contracts/shared.ts:18](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L18)

Tokens spent on hidden model reasoning when the provider reports them.

---

### rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Defined in: [src/contracts/shared.ts:22](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L22)

Prediction tokens rejected by speculative decoding, when reported.
