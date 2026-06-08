---
title: 'Function: clearCache()'
description: 'Clear the shared promptfoo cache.'
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **clearCache**(): `Promise`\<`boolean`\>

Defined in: [cache.ts:915](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L915)

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
