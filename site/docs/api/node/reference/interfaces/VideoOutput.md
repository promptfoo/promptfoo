---
title: 'Interface: VideoOutput'
description: 'Video attachment returned by providers that produce video. See supported Node.js imports, exact signatures, fields, and application examples for this symbol.'
sidebar_position: 47
---

## Import

```ts
import type { VideoOutput } from 'promptfoo';
```

Defined in: [src/contracts/providers.ts:130](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L130)

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

Defined in: [src/contracts/providers.ts:152](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L152)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [src/contracts/providers.ts:134](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L134)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [src/contracts/providers.ts:144](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L144)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [src/contracts/providers.ts:140](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L140)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [src/contracts/providers.ts:132](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L132)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [src/contracts/providers.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L150)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [src/contracts/providers.ts:154](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L154)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [src/contracts/providers.ts:142](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L142)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [src/contracts/providers.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L148)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [src/contracts/providers.ts:136](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L136)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [src/contracts/providers.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L146)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [src/contracts/providers.ts:138](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L138)

URL or storage URI for the generated video.
