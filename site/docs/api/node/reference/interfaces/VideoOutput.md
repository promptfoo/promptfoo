---
title: 'Interface: VideoOutput'
description: 'Video attachment returned by providers that produce video.'
---

## Import

```ts
import type { VideoOutput } from 'promptfoo';
```

Defined in: [types/providers.ts:421](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L421)

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

Defined in: [types/providers.ts:446](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L446)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [types/providers.ts:425](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L425)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:438](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L438)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:434](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L434)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:423](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L423)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [types/providers.ts:444](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L444)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [types/providers.ts:448](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L448)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [types/providers.ts:436](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L436)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [types/providers.ts:442](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L442)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [types/providers.ts:427](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L427)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

Provider-defined storage key for the generated video.

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [types/providers.ts:440](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L440)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [types/providers.ts:432](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L432)

URL or storage URI for the generated video.
