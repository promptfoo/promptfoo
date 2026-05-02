[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamMediaData

# Interface: RedteamMediaData

Defined in: [redteam/types.ts:381](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L381)

Media data (audio or image) for redteam history entries

## Properties

### data?

> `optional` **data?**: `string`

Defined in: [redteam/types.ts:390](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L390)

Media payload for rendering/transport.

- Base64 string (legacy/inline)
- `storageRef:<key>` string (external media storage)

Optional because some code paths only know the format and store the payload elsewhere.

---

### format

> **format**: `string`

Defined in: [redteam/types.ts:391](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L391)
