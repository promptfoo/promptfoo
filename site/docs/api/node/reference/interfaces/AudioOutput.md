[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AudioOutput

# Interface: AudioOutput

Defined in: [types/providers.ts:313](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L313)

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

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:321](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L321)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:329](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L329)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:319](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L319)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:331](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L331)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L317)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:325](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L325)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:315](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L315)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:327](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L327)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:323](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L323)

Transcript associated with the audio payload, when available.
