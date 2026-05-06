---
title: 'Interface: AudioOutput'
description: 'Audio attachment returned by providers that produce or transform sound.'
---

## Import

```ts
import type { AudioOutput } from 'promptfoo';
```

Defined in: [types/providers.ts:385](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L385)

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

Defined in: [types/providers.ts:393](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L393)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:401](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L401)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:391](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L391)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:403](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L403)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:389](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L389)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:397](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L397)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:387](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L387)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:399](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L399)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:395](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L395)

Transcript associated with the audio payload, when available.
