---
title: 'Interface: BlobRef'
---

Defined in: [blobs/types.ts:27](https://github.com/promptfoo/promptfoo/blob/main/src/blobs/types.ts#L27)

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

Defined in: [blobs/types.ts:31](https://github.com/promptfoo/promptfoo/blob/main/src/blobs/types.ts#L31)

Content hash used to deduplicate and retrieve the blob.

---

### mimeType

> **mimeType**: `string`

Defined in: [blobs/types.ts:33](https://github.com/promptfoo/promptfoo/blob/main/src/blobs/types.ts#L33)

MIME type of the stored blob.

---

### provider

> **provider**: `string`

Defined in: [blobs/types.ts:37](https://github.com/promptfoo/promptfoo/blob/main/src/blobs/types.ts#L37)

Storage backend that owns the blob.

---

### sizeBytes

> **sizeBytes**: `number`

Defined in: [blobs/types.ts:35](https://github.com/promptfoo/promptfoo/blob/main/src/blobs/types.ts#L35)

Blob size in bytes.

---

### uri

> **uri**: `string`

Defined in: [blobs/types.ts:29](https://github.com/promptfoo/promptfoo/blob/main/src/blobs/types.ts#L29)

Canonical URI, for example `promptfoo://blob/<hash>`.
