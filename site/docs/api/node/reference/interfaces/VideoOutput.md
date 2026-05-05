[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / VideoOutput

# Interface: VideoOutput

Defined in: [types/providers.ts:276](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L276)

Video attachment returned by providers that produce video.

## Properties

### aspectRatio?

> `optional` **aspectRatio?**: `string`

Defined in: [types/providers.ts:298](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L298)

Aspect ratio such as `16:9`.

---

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:280](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L280)

External blob reference for video data.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:290](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L290)

Video duration in seconds.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:286](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L286)

Container or codec name such as `mp4`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:278](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L278)

Provider video id, such as a job or operation identifier.

---

### model?

> `optional` **model?**: `string`

Defined in: [types/providers.ts:296](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L296)

Model that produced the video.

---

### resolution?

> `optional` **resolution?**: `string`

Defined in: [types/providers.ts:300](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L300)

Resolution tier such as `720p` or `1080p`.

---

### size?

> `optional` **size?**: `string`

Defined in: [types/providers.ts:288](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L288)

Provider-reported output dimensions, for example `1280x720`.

---

### spritesheet?

> `optional` **spritesheet?**: `string`

Defined in: [types/providers.ts:294](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L294)

URL or storage URI for a provider-generated spritesheet.

---

### storageRef?

> `optional` **storageRef?**: `object`

Defined in: [types/providers.ts:282](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L282)

Storage reference used by providers that persist generated media.

#### key?

> `optional` **key?**: `string`

---

### thumbnail?

> `optional` **thumbnail?**: `string`

Defined in: [types/providers.ts:292](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L292)

URL or storage URI for a representative thumbnail.

---

### url?

> `optional` **url?**: `string`

Defined in: [types/providers.ts:284](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L284)

URL or storage URI for the generated video.
