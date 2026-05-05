[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AudioOutput

# Interface: AudioOutput

Defined in: [types/providers.ts:238](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L238)

Audio attachment returned by providers that produce or transform sound.

## Properties

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:246](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L246)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:254](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L254)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:244](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L244)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:256](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L256)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:242](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L242)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:250](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L250)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:240](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L240)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:252](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L252)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:248](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L248)

Transcript associated with the audio payload, when available.
