[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ImageOutput

# Interface: ImageOutput

Defined in: [types/providers.ts:308](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L308)

Image attachment returned by providers that produce images.

## Properties

### blobRef?

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:312](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L312)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:310](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L310)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [types/providers.ts:314](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L314)

MIME type such as `image/png`.
