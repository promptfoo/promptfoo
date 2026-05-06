---
title: 'Interface: TransformContext'
description: 'Metadata supplied to every transform invocation.'
---

## Import

```ts
import type { TransformContext } from 'promptfoo';
```

Defined in: [types/transform.ts:17](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L17)

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

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types/transform.ts:23](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L23)

Additional runtime metadata passed through the pipeline.

---

### prompt?

> `optional` **prompt?**: `Record`\<`string`, `unknown`\> \| [`TransformPrompt`](TransformPrompt.md)

Defined in: [types/transform.ts:21](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L21)

Prompt metadata associated with the transform call site.

---

### uuid?

> `optional` **uuid?**: `string`

Defined in: [types/transform.ts:25](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L25)

Result identifier associated with the transform invocation, when available.

---

### vars?

> `optional` **vars?**: `Record`\<`string`, `unknown`\>

Defined in: [types/transform.ts:19](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L19)

Variables available at the transform call site.
