[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiOptionsParams

# Interface: CallApiOptionsParams

Defined in: [types/providers.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L157)

Per-request options passed to custom providers.

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [types/providers.ts:161](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L161)

Signal that can be used to abort the request.

---

### includeLogProbs?

> `optional` **includeLogProbs?**: `boolean`

Defined in: [types/providers.ts:159](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L159)

Whether the caller requested token log probabilities when supported.
