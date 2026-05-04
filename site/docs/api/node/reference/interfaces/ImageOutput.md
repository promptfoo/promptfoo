[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ImageOutput

# Interface: ImageOutput

Defined in: [types/providers.ts:285](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L285)

Image attachment returned by providers that produce images.

## Properties

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:289](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L289)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:287](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L287)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [types/providers.ts:291](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L291)

MIME type such as `image/png`.
