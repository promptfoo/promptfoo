---
title: 'Interface: VideoOutput'
description: 'Video attachment returned by providers that produce video.'
---

## Import

```ts
import type { VideoOutput } from 'promptfoo';
```

Defined in: [types/providers.ts:444](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L444)

Video attachment returned by providers that produce video.

Providers usually return a retrievable `url`, `storageRef`, or `blobRef`;
the remaining fields describe playback and generated-media metadata.

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

Defined in: [types/providers.ts:469](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L469)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [types/providers.ts:448](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L448)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:461](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L461)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:457](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L457)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:446](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L446)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [types/providers.ts:467](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L467)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [types/providers.ts:471](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L471)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [types/providers.ts:459](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L459)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [types/providers.ts:465](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L465)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [types/providers.ts:450](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L450)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

Provider-defined storage key for the generated video.

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [types/providers.ts:463](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L463)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [types/providers.ts:455](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L455)

URL or storage URI for the generated video.
