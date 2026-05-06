[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / GuardrailResponse

# Interface: GuardrailResponse

Defined in: [types/providers.ts:330](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L330)

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

Defined in: [types/providers.ts:336](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L336)

Aggregate flag when the provider does not distinguish input from output.

---

### flaggedInput?

> `optional` **flaggedInput?**: `boolean`

Defined in: [types/providers.ts:332](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L332)

Whether the input prompt tripped a guardrail.

---

### flaggedOutput?

> `optional` **flaggedOutput?**: `boolean`

Defined in: [types/providers.ts:334](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L334)

Whether the provider output tripped a guardrail.

---

### reason?

> `optional` **reason?**: `string`

Defined in: [types/providers.ts:338](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L338)

Provider-supplied reason for the guardrail outcome.
