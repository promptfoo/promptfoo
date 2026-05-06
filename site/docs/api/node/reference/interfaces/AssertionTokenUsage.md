[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AssertionTokenUsage

# Interface: AssertionTokenUsage

Defined in: [types/shared.ts:118](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L118)

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

Defined in: [types/shared.ts:126](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L126)

Assertion tokens served from cache.

---

### completion?

> `optional` **completion?**: `number`

Defined in: [types/shared.ts:124](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L124)

Assertion completion/output tokens.

---

### completionDetails?

> `optional` **completionDetails?**: [`CompletionTokenDetails`](CompletionTokenDetails.md)

Defined in: [types/shared.ts:130](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L130)

Detailed completion-token breakdown for assertion grading.

---

### numRequests?

> `optional` **numRequests?**: `number`

Defined in: [types/shared.ts:128](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L128)

Number of assertion model requests represented here.

---

### prompt?

> `optional` **prompt?**: `number`

Defined in: [types/shared.ts:122](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L122)

Assertion prompt/input tokens.

---

### total?

> `optional` **total?**: `number`

Defined in: [types/shared.ts:120](https://github.com/promptfoo/promptfoo/blob/main/src/types/shared.ts#L120)

Total assertion tokens.
