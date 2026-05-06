---
title: 'Interface: AudioOutput'
---

Defined in: [types/providers.ts:366](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L366)

Audio attachment returned by providers that produce or transform sound.

## Example

```ts
const audio: AudioOutput = {
  data: 'UklGR...',
  format: 'wav',
  sampleRate: 24000,
  channels: 1,
};
```

## Properties

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [types/providers.ts:374](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L374)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:382](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L382)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:372](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L372)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:384](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L384)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:370](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L370)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:378](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L378)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:368](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L368)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:380](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L380)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:376](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L376)

Transcript associated with the audio payload, when available.
