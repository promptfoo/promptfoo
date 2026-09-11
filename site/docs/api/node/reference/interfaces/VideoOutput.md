---
title: 'Interface: VideoOutput'
description: 'Video attachment returned by providers that produce video. See supported Node.js imports, exact signatures, fields, and application examples for this symbol.'
sidebar_position: 47
---

## Import

```ts
import type { VideoOutput } from 'promptfoo';
```

Defined in: contracts/providers.ts:130

Video attachment returned by providers that produce video.

## Example

```ts
const video: VideoOutput = {
  url: 'https://cdn.example.com/video.mp4',
  format: 'mp4',
  duration: 6,
  aspectRatio: '16:9',
};
```

## Properties

### aspectRatio?

> `optional` **aspectRatio?**: `string`

Defined in: contracts/providers.ts:152

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: contracts/providers.ts:134

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: contracts/providers.ts:144

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: contracts/providers.ts:140

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: contracts/providers.ts:132

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: contracts/providers.ts:150

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: contracts/providers.ts:154

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: contracts/providers.ts:142

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: contracts/providers.ts:148

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: contracts/providers.ts:136

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: contracts/providers.ts:146

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: contracts/providers.ts:138

URL or storage URI for the generated video.
