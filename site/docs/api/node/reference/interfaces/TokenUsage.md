[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TokenUsage

# Interface: TokenUsage

Defined in: [types/shared.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L147)

Token accounting reported by providers and graders.

## Example

```ts
const usage: TokenUsage = {
  prompt: 12,
  completion: 8,
  total: 20,
};
```

## Properties

### assertions?

> `optional` **assertions?**: [`AssertionTokenUsage`](AssertionTokenUsage.md)

Defined in: [types/shared.ts:161](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L161)

Token usage accumulated by model-graded assertions.

---

### cached?

> `optional` **cached?**: `number`

Defined in: [types/shared.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L153)

Tokens served from a provider cache, when reported.

---

### completion?

> `optional` **completion?**: `number`

Defined in: [types/shared.ts:151](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L151)

Completion/output tokens produced by the provider call.

---

### completionDetails?

> `optional` **completionDetails?**: [`CompletionTokenDetails`](CompletionTokenDetails.md)

Defined in: [types/shared.ts:159](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L159)

Provider-specific completion-token breakdown.

---

### numRequests?

> `optional` **numRequests?**: `number`

Defined in: [types/shared.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L157)

Number of underlying requests represented by this usage object.

---

### prompt?

> `optional` **prompt?**: `number`

Defined in: [types/shared.ts:149](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L149)

Prompt/input tokens consumed by the provider call.

---

### total?

> `optional` **total?**: `number`

Defined in: [types/shared.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L155)

Total tokens reported for the provider call.
