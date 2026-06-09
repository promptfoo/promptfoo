---
title: 'Interface: ProviderClassificationResponse'
description: 'Response returned by classification-capable providers.'
sidebar_position: 35
---

## Import

```ts
import type { ProviderClassificationResponse } from 'promptfoo';
```

Defined in: [contracts/providers.ts:325](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L325)

Response returned by classification-capable providers.

## Properties

### classification?

> `optional` **classification?**: `Record`\<`string`, `number`\>

Defined in: [contracts/providers.ts:329](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L329)

Class labels mapped to provider-reported scores.

---

### error?

> `optional` **error?**: `string`

Defined in: [contracts/providers.ts:327](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L327)

Error message when the classification call failed without throwing.
