---
title: 'Interface: AudioOutput'
description: 'Audio attachment returned by providers that produce or transform sound.'
---

## Import

```ts
import type { AudioOutput } from 'promptfoo';
```

Defined in: [types/providers.ts:406](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L406)

Audio attachment returned by providers that produce or transform sound.

Populate `data` for inline payloads or `blobRef` when the audio has already
been externalized out of the result row.

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

Defined in: [types/providers.ts:414](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L414)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:422](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L422)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:412](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L412)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:424](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L424)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:410](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L410)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:418](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L418)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:408](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L408)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:420](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L420)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:416](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L416)

Transcript associated with the audio payload, when available.
