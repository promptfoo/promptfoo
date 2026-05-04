[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / GuardPiiFinding

# Interface: GuardPiiFinding

Defined in: [guardrails.ts:12](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L12)

**`Beta`**

Personally identifiable information span reported by a guardrail endpoint.

## Properties

### end

> **end**: `number`

Defined in: [guardrails.ts:18](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L18)

**`Beta`**

Zero-based exclusive end offset within the inspected text.

---

### entity_type

> **entity_type**: `string`

Defined in: [guardrails.ts:14](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L14)

**`Beta`**

Entity class reported by the guardrail service.

---

### pii

> **pii**: `string`

Defined in: [guardrails.ts:20](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L20)

**`Beta`**

Matched text reported by the guardrail service.

---

### start

> **start**: `number`

Defined in: [guardrails.ts:16](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L16)

**`Beta`**

Zero-based inclusive start offset within the inspected text.
