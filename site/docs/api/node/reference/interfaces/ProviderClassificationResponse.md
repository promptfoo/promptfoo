---
title: 'Interface: ProviderClassificationResponse'
description: 'Response returned by classification-capable providers.'
---

## Import

```ts
import type { ProviderClassificationResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:678](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L678)

Response returned by classification-capable providers.

This is the payload returned from `callClassificationApi()`. Label names and
score ranges are provider-defined, so consumers should not assume a fixed
taxonomy unless the provider documents one.

## Example

```ts
const response: ProviderClassificationResponse = {
  classification: { positive: 0.91, negative: 0.09 },
};
```

## Properties

### classification?

> `optional` **classification?**: `Record`\<`string`, `number`\>

Defined in: [types/providers.ts:682](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L682)

Class labels mapped to provider-reported scores.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:680](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L680)

Error message when the classification call failed without throwing.
