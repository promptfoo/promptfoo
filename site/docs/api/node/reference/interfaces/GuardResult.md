[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / GuardResult

# Interface: GuardResult

Defined in: [guardrails.ts:46](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L46)

**`Beta`**

Response returned by the `guard()`, `pii()`, and `harm()` guardrail helpers.

## Properties

### model

> **model**: `string`

Defined in: [guardrails.ts:48](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L48)

**`Beta`**

Model used by the guardrail service.

---

### results

> **results**: [`GuardResultEntry`](GuardResultEntry.md)[]

Defined in: [guardrails.ts:50](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L50)

**`Beta`**

Classification results returned for the inspected input.
