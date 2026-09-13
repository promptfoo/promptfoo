---
title: 'Interface: ProviderClassificationResponse'
description: 'Response returned by classification-capable providers. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 33
---

## Import

```ts
import type { ProviderClassificationResponse } from 'promptfoo';
```

Defined in: [src/contracts/providers.ts:328](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L328)

Response returned by classification-capable providers.

## Properties

### classification?

<!-- prettier-ignore -->
> `optional` **classification?**: `Record`\<`string`, `number`\>

Defined in: [src/contracts/providers.ts:332](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L332)

Class labels mapped to provider-reported scores.

---

### error?

> `optional` **error?**: `string`

Defined in: [src/contracts/providers.ts:330](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L330)

Error message when the classification call failed without throwing.
