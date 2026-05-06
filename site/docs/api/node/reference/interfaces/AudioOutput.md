[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AudioOutput

# Interface: AudioOutput

Defined in: [types/providers.ts:356](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L356)

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

Defined in: [types/providers.ts:364](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L364)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:372](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L372)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:362](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L362)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:374](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L374)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:360](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L360)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:368](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L368)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:358](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L358)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:370](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L370)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:366](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L366)

Transcript associated with the audio payload, when available.
