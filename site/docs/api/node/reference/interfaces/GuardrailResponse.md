---
title: 'Interface: GuardrailResponse'
---

Defined in: [types/providers.ts:340](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L340)

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

Defined in: [types/providers.ts:346](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L346)

Aggregate flag when the provider does not distinguish input from output.

---

### flaggedInput?

> `optional` **flaggedInput?**: `boolean`

Defined in: [types/providers.ts:342](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L342)

Whether the input prompt tripped a guardrail.

---

### flaggedOutput?

> `optional` **flaggedOutput?**: `boolean`

Defined in: [types/providers.ts:344](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L344)

Whether the provider output tripped a guardrail.

---

### reason?

> `optional` **reason?**: `string`

Defined in: [types/providers.ts:348](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L348)

Provider-supplied reason for the guardrail outcome.
