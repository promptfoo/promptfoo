[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / VideoOutput

# Interface: VideoOutput

Defined in: [types/providers.ts:253](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L253)

Video attachment returned by providers that produce video.

## Properties

### aspectRatio?

> `optional` **aspectRatio?**: `string`

Defined in: [types/providers.ts:275](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L275)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:257](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L257)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:267](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L267)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:263](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L263)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:255](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L255)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [types/providers.ts:273](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L273)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [types/providers.ts:277](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L277)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [types/providers.ts:265](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L265)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [types/providers.ts:271](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L271)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [types/providers.ts:259](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L259)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [types/providers.ts:269](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L269)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [types/providers.ts:261](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L261)

URL or storage URI for the generated video.
