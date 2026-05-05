[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ImageOutput

# Interface: ImageOutput

Defined in: [types/providers.ts:296](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L296)

Image attachment returned by providers that produce images.

## Properties

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:300](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L300)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:298](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L298)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [types/providers.ts:302](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L302)

MIME type such as `image/png`.
