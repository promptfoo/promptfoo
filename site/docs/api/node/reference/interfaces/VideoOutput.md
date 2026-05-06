---
title: 'Interface: VideoOutput'
description: 'Video attachment returned by providers that produce video.'
---

## Import

```ts
import type { VideoOutput } from 'promptfoo';
```

Defined in: [types/providers.ts:445](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L445)

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

Defined in: [types/providers.ts:470](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L470)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [types/providers.ts:449](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L449)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:462](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L462)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:458](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L458)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:447](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L447)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [types/providers.ts:468](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L468)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [types/providers.ts:472](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L472)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [types/providers.ts:460](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L460)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [types/providers.ts:466](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L466)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [types/providers.ts:451](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L451)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

Provider-defined storage key for the generated video.

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [types/providers.ts:464](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L464)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [types/providers.ts:456](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L456)

URL or storage URI for the generated video.
