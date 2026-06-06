---
title: 'Interface: BlobRef'
description: 'External blob reference used by media-capable provider responses.'
---

## Import

```ts
import type { BlobRef } from 'promptfoo';
```

Defined in: [contracts/blobs.ts:17](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/blobs.ts#L17)

External blob reference used by media-capable provider responses.

## Example

```ts
const blob: BlobRef = {
  uri: 'promptfoo://blob/abc123',
  hash: 'abc123',
  mimeType: 'image/png',
  sizeBytes: 1024,
  provider: 'local',
};
```

## Properties

### hash

> **hash**: `string`

Defined in: [contracts/blobs.ts:21](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/blobs.ts#L21)

Content hash used to deduplicate and retrieve the blob.

---

### mimeType

> **mimeType**: `string`

Defined in: [contracts/blobs.ts:23](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/blobs.ts#L23)

MIME type of the stored blob.

---

### provider

> **provider**: `string`

Defined in: [contracts/blobs.ts:27](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/blobs.ts#L27)

Storage backend that owns the blob.

---

### sizeBytes

> **sizeBytes**: `number`

Defined in: [contracts/blobs.ts:25](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/blobs.ts#L25)

Blob size in bytes.

---

### uri

> **uri**: `string`

Defined in: [contracts/blobs.ts:19](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/blobs.ts#L19)

Canonical URI, for example `promptfoo://blob/<hash>`.
