---
title: 'Interface: TransformPrompt'
description: 'Conventional shape for TransformContext.prompt. See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 46
---

## Import

```ts
import type { TransformPrompt } from 'promptfoo';
```

Defined in: contracts/transform.ts:46

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

Defined in: contracts/transform.ts:54

Display-friendly prompt text when it differs from `raw`.

---

### id?

> `optional` **id?**: `string`

Defined in: contracts/transform.ts:50

Stable prompt identifier.

---

### label?

> `optional` **label?**: `string`

Defined in: contracts/transform.ts:48

Human-readable prompt label.

---

### raw?

> `optional` **raw?**: `string`

Defined in: contracts/transform.ts:52

Raw prompt text before display transforms.
