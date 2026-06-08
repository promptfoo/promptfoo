---
title: 'Interface: TransformPrompt'
description: 'Conventional shape for TransformContext.prompt.'
sidebar_position: 48
---

## Import

```ts
import type { TransformPrompt } from 'promptfoo';
```

Defined in: [contracts/transform.ts:46](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/transform.ts#L46)

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

Defined in: [contracts/transform.ts:54](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/transform.ts#L54)

Display-friendly prompt text when it differs from `raw`.

---

### id?

> `optional` **id?**: `string`

Defined in: [contracts/transform.ts:50](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/transform.ts#L50)

Stable prompt identifier.

---

### label?

> `optional` **label?**: `string`

Defined in: [contracts/transform.ts:48](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/transform.ts#L48)

Human-readable prompt label.

---

### raw?

> `optional` **raw?**: `string`

Defined in: [contracts/transform.ts:52](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/transform.ts#L52)

Raw prompt text before display transforms.
