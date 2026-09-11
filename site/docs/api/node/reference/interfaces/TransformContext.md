---
title: 'Interface: TransformContext'
description: 'Metadata supplied to every transform invocation. See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 45
---

## Import

```ts
import type { TransformContext } from 'promptfoo';
```

Defined in: contracts/transform.ts:17

Metadata supplied to every transform invocation. Known fields are typed;
the open index signature preserves extensibility for plugins that attach
their own keys at runtime.

## Example

```ts
const context: TransformContext = {
  vars: { user: 'Ada' },
  prompt: { label: 'summary' },
  metadata: { source: 'fixture' },
};
```

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### metadata?

<!-- prettier-ignore -->
> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: contracts/transform.ts:23

Additional runtime metadata passed through the pipeline.

---

### prompt?

<!-- prettier-ignore -->
> `optional` **prompt?**: `Record`\<`string`, `unknown`\> \| [`TransformPrompt`](TransformPrompt.md)

Defined in: contracts/transform.ts:21

Prompt metadata associated with the transform call site.

---

### uuid?

> `optional` **uuid?**: `string`

Defined in: contracts/transform.ts:25

Result identifier associated with the transform invocation, when available.

---

### vars?

<!-- prettier-ignore -->
> `optional` **vars?**: `Record`\<`string`, `unknown`\>

Defined in: contracts/transform.ts:19

Variables available at the transform call site.
