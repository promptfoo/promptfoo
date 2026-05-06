---
title: 'Interface: ImageOutput'
---

Defined in: [types/providers.ts:445](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L445)

Image attachment returned by providers that produce images.

## Example

```ts
const image: ImageOutput = {
  data: 'data:image/png;base64,...',
  mimeType: 'image/png',
};
```

## Properties

### blobRef?

> `optional` **blobRef?**: [`BlobRef`](BlobRef.md)

Defined in: [types/providers.ts:449](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L449)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:447](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L447)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [types/providers.ts:451](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L451)

MIME type such as `image/png`.
