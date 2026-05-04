[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AudioOutput

# Interface: AudioOutput

Defined in: [types/providers.ts:227](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L227)

Audio attachment returned by providers that produce or transform sound.

## Properties

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:235](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L235)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:243](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L243)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:233](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L233)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:245](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L245)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:231](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L231)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:239](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L239)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:229](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L229)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:241](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L241)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:237](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L237)

Transcript associated with the audio payload, when available.
