---
title: 'Interface: AssertionTokenUsage'
description: 'Token accounting attributed to model-graded assertions.'
sidebar_position: 6
---

## Import

```ts
import type { AssertionTokenUsage } from 'promptfoo';
```

Defined in: [contracts/shared.ts:96](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L96)

Token accounting attributed to model-graded assertions.

## Example

```ts
const usage: AssertionTokenUsage = {
  prompt: 14,
  completion: 6,
  total: 20,
};
```

## Properties

### cached?

> `optional` **cached?**: `number`

Defined in: [contracts/shared.ts:104](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L104)

Assertion tokens served from cache.

---

### completion?

> `optional` **completion?**: `number`

Defined in: [contracts/shared.ts:102](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L102)

Assertion completion/output tokens.

---

### completionDetails?

> `optional` **completionDetails?**: [`CompletionTokenDetails`](CompletionTokenDetails.md)

Defined in: [contracts/shared.ts:108](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L108)

Detailed completion-token breakdown for assertion grading.

---

### numRequests?

> `optional` **numRequests?**: `number`

Defined in: [contracts/shared.ts:106](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L106)

Number of assertion model requests represented here.

---

### prompt?

> `optional` **prompt?**: `number`

Defined in: [contracts/shared.ts:100](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L100)

Assertion prompt/input tokens.

---

### total?

> `optional` **total?**: `number`

Defined in: [contracts/shared.ts:98](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L98)

Total assertion tokens.
