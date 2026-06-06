---
title: 'Interface: ImageOutput'
description: 'Image attachment returned by providers that produce images.'
---

## Import

```ts
import type { ImageOutput } from 'promptfoo';
```

Defined in: [contracts/providers.ts:69](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L69)

Image attachment returned by providers that produce images.

Populate either `data` for inline payloads or `blobRef` when the image has
already been externalized out of the result row.

## Properties

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [contracts/providers.ts:73](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L73)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [contracts/providers.ts:71](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L71)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [contracts/providers.ts:75](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L75)

MIME type such as `image/png`.
