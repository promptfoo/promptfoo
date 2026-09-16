---
title: 'Interface: AudioOutput'
description: 'Audio attachment returned by providers that produce or transform sound. See supported imports, signatures, fields, examples, and usage details for this symbol.'
sidebar_position: 7
---

## Import

```ts
import type { AudioOutput } from 'promptfoo';
```

Defined in: [src/contracts/providers.ts:94](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L94)

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

Defined in: [src/contracts/providers.ts:102](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L102)

External blob reference when audio is stored outside the result row.

---

### channels?

> `optional` **channels?**: `number`

Defined in: [src/contracts/providers.ts:110](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L110)

Number of audio channels.

---

### data?

> `optional` **data?**: `string`

Defined in: [src/contracts/providers.ts:100](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L100)

Base64-encoded audio payload when data is embedded inline.

---

### duration?

> `optional` **duration?**: `number`

Defined in: [src/contracts/providers.ts:112](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L112)

Audio duration in seconds.

---

### expiresAt?

> `optional` **expiresAt?**: `number`

Defined in: [src/contracts/providers.ts:98](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L98)

Expiration time for provider-hosted audio, as a Unix timestamp.

---

### format?

> `optional` **format?**: `string`

Defined in: [src/contracts/providers.ts:106](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L106)

Container or codec name such as `wav` or `mp3`.

---

### id?

> `optional` **id?**: `string`

Defined in: [src/contracts/providers.ts:96](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L96)

Provider-defined audio identifier.

---

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [src/contracts/providers.ts:108](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L108)

Audio sample rate in hertz.

---

### transcript?

> `optional` **transcript?**: `string`

Defined in: [src/contracts/providers.ts:104](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L104)

Transcript associated with the audio payload, when available.
