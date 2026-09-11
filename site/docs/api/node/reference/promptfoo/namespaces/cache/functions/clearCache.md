---
title: 'Function: clearCache()'
description: "<!-- prettier-ignore --> > clearCache(): Promise\\<boolean\\> See supported Node.js imports, exact signatures, fields, and application examples for this symbol."
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';
```

<!-- prettier-ignore -->
> **clearCache**(): `Promise`\<`boolean`\>

Defined in: [src/cache.ts:1046](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L1046)

Clear the shared promptfoo cache.

Use this when tests or scripts need to remove existing shared entries before
running a fresh request path.

## Returns

`Promise`\<`boolean`\>

`true` after the active cache store has been cleared.

## Example

```ts
import { cache } from 'promptfoo';

await cache.clearCache();
```
