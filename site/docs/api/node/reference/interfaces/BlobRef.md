---
title: 'Interface: BlobRef'
description: 'External blob reference used by media-capable provider responses. See the supported promptfoo Node.js API imports, signatures, fields, and application examples.'
sidebar_position: 8
---

## Import

```ts
import type { BlobRef } from 'promptfoo';
```

Defined in: contracts/blobs.ts:17

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

Defined in: contracts/blobs.ts:21

Content hash used to deduplicate and retrieve the blob.

---

### mimeType

> **mimeType**: `string`

Defined in: contracts/blobs.ts:23

MIME type of the stored blob.

---

### provider

> **provider**: `string`

Defined in: contracts/blobs.ts:27

Storage backend that owns the blob.

---

### sizeBytes

> **sizeBytes**: `number`

Defined in: contracts/blobs.ts:25

Blob size in bytes.

---

### uri

> **uri**: `string`

Defined in: contracts/blobs.ts:19

Canonical URI, for example `promptfoo://blob/<hash>`.
