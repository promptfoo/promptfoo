---
title: 'Interface: VideoOutput'
description: 'Video attachment returned by providers that produce video.'
sidebar_position: 49
---

## Import

```ts
import type { VideoOutput } from 'promptfoo';
```

Defined in: [contracts/providers.ts:129](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L129)

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

Defined in: [contracts/providers.ts:151](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L151)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [contracts/providers.ts:133](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L133)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [contracts/providers.ts:143](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L143)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [contracts/providers.ts:139](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L139)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [contracts/providers.ts:131](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L131)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [contracts/providers.ts:149](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L149)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [contracts/providers.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L153)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [contracts/providers.ts:141](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L141)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [contracts/providers.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L147)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [contracts/providers.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L135)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [contracts/providers.ts:145](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L145)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [contracts/providers.ts:137](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L137)

URL or storage URI for the generated video.
