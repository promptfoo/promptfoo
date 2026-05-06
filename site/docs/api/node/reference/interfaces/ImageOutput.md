[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ImageOutput

# Interface: ImageOutput

Defined in: [types/providers.ts:435](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L435)

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

Defined in: [types/providers.ts:439](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L439)

External blob reference when image data is stored outside the result row.

---

### data?

> `optional` **data?**: `string`

Defined in: [types/providers.ts:437](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L437)

Inline data URI or base64 payload.

---

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: [types/providers.ts:441](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L441)

MIME type such as `image/png`.
