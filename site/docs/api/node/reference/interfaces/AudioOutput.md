---
title: 'Interface: AudioOutput'
description: 'Audio attachment returned by providers that produce or transform sound.'
---

## Import

```ts
import type { AudioOutput } from 'promptfoo';
```

Defined in: [types/providers.ts:405](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L405)

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

Defined in: [types/providers.ts:413](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L413)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [types/providers.ts:421](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L421)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:411](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L411)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [types/providers.ts:423](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L423)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [types/providers.ts:409](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L409)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:417](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L417)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:407](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L407)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types/providers.ts:419](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L419)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [types/providers.ts:415](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L415)

Transcript associated with the audio payload, when available.
