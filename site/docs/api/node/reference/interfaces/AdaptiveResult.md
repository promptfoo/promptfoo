[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AdaptiveResult

# Interface: AdaptiveResult

Defined in: [guardrails.ts:86](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L86)

**`Beta`**

Response returned by `guardrails.adaptive()`.

## Properties

### adaptedPrompt

> **adaptedPrompt**: `string`

Defined in: [guardrails.ts:90](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L90)

**`Beta`**

Prompt after all adaptive rewrites have been applied.

---

### model

> **model**: `string`

Defined in: [guardrails.ts:88](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L88)

**`Beta`**

Model used by the adaptive guardrail service.

---

### modifications

> **modifications**: [`AdaptiveModification`](AdaptiveModification.md)[]

Defined in: [guardrails.ts:92](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L92)

**`Beta`**

Ordered list of rewrites applied to the prompt.
