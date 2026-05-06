[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / VideoOutput

# Interface: VideoOutput

Defined in: [types/providers.ts:349](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L349)

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

Defined in: [types/providers.ts:374](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L374)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:353](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L353)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:366](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L366)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:362](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L362)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:351](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L351)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [types/providers.ts:372](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L372)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [types/providers.ts:376](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L376)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [types/providers.ts:364](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L364)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [types/providers.ts:370](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L370)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [types/providers.ts:355](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L355)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

Provider-defined storage key for the generated video.

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [types/providers.ts:368](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L368)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [types/providers.ts:360](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L360)

URL or storage URI for the generated video.
