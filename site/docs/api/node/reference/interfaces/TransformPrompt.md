---
title: 'Interface: TransformPrompt'
---

Defined in: [types/transform.ts:46](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L46)

Conventional shape for `TransformContext.prompt`.

Callers may pass additional fields, but these are the prompt fields that
built-in transforms and docs rely on.

## Example

```ts
const prompt: TransformPrompt = {
  id: 'summary',
  label: 'Summary prompt',
  raw: 'Summarize {{article}}',
};
```

## Properties

### display?

> `optional` **display?**: `string`

Defined in: [types/transform.ts:54](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L54)

Display-friendly prompt text when it differs from `raw`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/transform.ts:50](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L50)

Stable prompt identifier.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/transform.ts:48](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L48)

Human-readable prompt label.

---

### raw?

> `optional` **raw?**: `string`

Defined in: [types/transform.ts:52](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L52)

Raw prompt text before display transforms.
