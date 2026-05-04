[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / GuardResultEntry

# Interface: GuardResultEntry

Defined in: [guardrails.ts:28](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L28)

**`Beta`**

One guardrail classification result for an inspected input.

## Properties

### categories

> **categories**: `Record`\<`string`, `boolean`\>

Defined in: [guardrails.ts:30](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L30)

**`Beta`**

Boolean decision for each guardrail category.

---

### category_scores

> **category_scores**: `Record`\<`string`, `number`\>

Defined in: [guardrails.ts:32](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L32)

**`Beta`**

Numeric confidence score for each guardrail category.

---

### flagged

> **flagged**: `boolean`

Defined in: [guardrails.ts:34](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L34)

**`Beta`**

Whether any category flagged the inspected input.

---

### payload?

> `optional` **payload?**: `object`

Defined in: [guardrails.ts:36](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L36)

**`Beta`**

Optional endpoint-specific payload such as PII spans.

#### pii?

> `optional` **pii?**: [`GuardPiiFinding`](GuardPiiFinding.md)[]
