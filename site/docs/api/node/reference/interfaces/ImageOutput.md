---
title: 'Interface: ImageOutput'
description: 'Image attachment returned by providers that produce images. See supported Node.js imports, exact signatures, fields, and application examples for this symbol.'
sidebar_position: 23
---

## Import

```ts
import type { ImageOutput } from 'promptfoo';
```

Defined in: contracts/providers.ts:70

Image attachment returned by providers that produce images.

Populate either `data` for inline payloads or `blobRef` when the image has
already been externalized out of the result row.

## Properties

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: contracts/providers.ts:74

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: contracts/providers.ts:72

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: contracts/providers.ts:76

MIME type such as `image/png`.
