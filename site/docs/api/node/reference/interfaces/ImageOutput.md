[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ImageOutput

# Interface: ImageOutput

Defined in: [types/providers.ts:392](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L392)

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

> `optional` **blobRef?**: `BlobRef`

Defined in: [types/providers.ts:396](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L396)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:394](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L394)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [types/providers.ts:398](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L398)

MIME type such as `image/png`.
