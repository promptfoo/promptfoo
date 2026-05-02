[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamHistoryEntry

# Interface: RedteamHistoryEntry

Defined in: [redteam/types.ts:397](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L397)

Single entry in redteam conversation history

## Properties

### inputVars?

> `optional` **inputVars?**: `Record`\<`string`, `string`\>

Defined in: [redteam/types.ts:409](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L409)

Extracted input variables for multi-input mode

---

### output

> **output**: `string`

Defined in: [redteam/types.ts:399](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L399)

---

### outputAudio?

> `optional` **outputAudio?**: [`RedteamMediaData`](RedteamMediaData.md)

Defined in: [redteam/types.ts:405](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L405)

Audio data from the target response

---

### outputImage?

> `optional` **outputImage?**: [`RedteamMediaData`](RedteamMediaData.md)

Defined in: [redteam/types.ts:407](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L407)

Image data from the target response

---

### prompt

> **prompt**: `string`

Defined in: [redteam/types.ts:398](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L398)

---

### promptAudio?

> `optional` **promptAudio?**: [`RedteamMediaData`](RedteamMediaData.md)

Defined in: [redteam/types.ts:401](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L401)

Audio data for the prompt (when using audio transforms)

---

### promptImage?

> `optional` **promptImage?**: [`RedteamMediaData`](RedteamMediaData.md)

Defined in: [redteam/types.ts:403](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L403)

Image data for the prompt (when using image transforms)
