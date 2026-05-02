[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / GuardResult

# Interface: GuardResult

Defined in: [guardrails.ts:12](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L12)

**`Beta`**

Response returned by the `guard()`, `pii()`, and `harm()` guardrail helpers.

## Properties

### model

> **model**: `string`

Defined in: [guardrails.ts:13](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L13)

**`Beta`**

---

### results

> **results**: `object`[]

Defined in: [guardrails.ts:14](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L14)

**`Beta`**

#### categories

> **categories**: `Record`\<`string`, `boolean`\>

#### category_scores

> **category_scores**: `Record`\<`string`, `number`\>

#### flagged

> **flagged**: `boolean`

#### payload?

> `optional` **payload?**: `object`

##### payload.pii?

> `optional` **pii?**: `object`[]
