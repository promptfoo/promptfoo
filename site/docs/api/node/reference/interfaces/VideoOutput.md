---
title: 'Interface: VideoOutput'
---

Defined in: [types/providers.ts:402](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L402)

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

Defined in: [types/providers.ts:427](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L427)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [types/providers.ts:406](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L406)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:419](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L419)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:415](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L415)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:404](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L404)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [types/providers.ts:425](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L425)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [types/providers.ts:429](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L429)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [types/providers.ts:417](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L417)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [types/providers.ts:423](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L423)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [types/providers.ts:408](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L408)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

Provider-defined storage key for the generated video.

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [types/providers.ts:421](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L421)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [types/providers.ts:413](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L413)

URL or storage URI for the generated video.
