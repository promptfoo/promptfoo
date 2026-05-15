---
title: 'Interface: GuardrailResponse'
description: 'Guardrail outcome metadata returned by moderation-aware providers.'
---

## Import

```ts
import type { GuardrailResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:376](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L376)

Guardrail outcome metadata returned by moderation-aware providers.

## Example

```ts
const guardrails: GuardrailResponse = {
  flaggedInput: false,
  flaggedOutput: true,
  reason: 'Detected disallowed content',
};
```

## Properties

### flagged?

> `optional` **flagged?**: `boolean`

Defined in: [types/providers.ts:382](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L382)

Aggregate flag when the provider does not distinguish input from output.

---

### flaggedInput?

> `optional` **flaggedInput?**: `boolean`

Defined in: [types/providers.ts:378](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L378)

Whether the input prompt tripped a guardrail.

---

### flaggedOutput?

> `optional` **flaggedOutput?**: `boolean`

Defined in: [types/providers.ts:380](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L380)

Whether the provider output tripped a guardrail.

---

### reason?

> `optional` **reason?**: `string`

Defined in: [types/providers.ts:384](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L384)

Provider-supplied reason for the guardrail outcome.
