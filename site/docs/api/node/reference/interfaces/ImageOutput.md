---
title: 'Interface: ImageOutput'
description: 'Image attachment returned by providers that produce images.'
---

## Import

```ts
import type { ImageOutput } from 'promptfoo';
```

Defined in: [types/providers.ts:490](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L490)

Image attachment returned by providers that produce images.

Populate either `data` for inline payloads or `blobRef` when the image has
already been externalized out of the result row.

## Example

```ts
const image: ImageOutput = {
  data: 'data:image/png;base64,...',
  mimeType: 'image/png',
};
```

## Properties

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [types/providers.ts:494](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L494)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:492](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L492)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [types/providers.ts:496](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L496)

MIME type such as `image/png`.
