---
title: 'Interface: AudioOutput'
description: 'Audio attachment returned by providers that produce or transform sound.'
sidebar_position: 9
---

## Import

```ts
import type { AudioOutput } from 'promptfoo';
```

Defined in: [contracts/providers.ts:93](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L93)

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

Defined in: [contracts/providers.ts:101](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L101)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [contracts/providers.ts:109](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L109)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [contracts/providers.ts:99](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L99)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [contracts/providers.ts:111](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L111)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [contracts/providers.ts:97](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L97)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [contracts/providers.ts:105](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L105)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [contracts/providers.ts:95](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L95)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [contracts/providers.ts:107](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L107)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [contracts/providers.ts:103](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L103)

Transcript associated with the audio payload, when available.
