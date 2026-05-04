[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TransformPrompt

# Interface: TransformPrompt

Defined in: [types/transform.ts:19](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L19)

Conventional shape for `TransformContext.prompt`. Callers may pass additional fields.

## Properties

### display?

> `optional` **display?**: `string`

Defined in: [types/transform.ts:27](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L27)

Display-friendly prompt text when it differs from `raw`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/transform.ts:23](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L23)

Stable prompt identifier.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/transform.ts:21](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L21)

Human-readable prompt label.

---

### raw?

> `optional` **raw?**: `string`

Defined in: [types/transform.ts:25](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L25)

Raw prompt text before display transforms.
