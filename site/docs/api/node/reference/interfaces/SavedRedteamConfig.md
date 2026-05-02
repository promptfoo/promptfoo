[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / SavedRedteamConfig

# Interface: SavedRedteamConfig

Defined in: [redteam/types.ts:337](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L337)

## Properties

### applicationDefinition

> **applicationDefinition**: `object`

Defined in: [redteam/types.ts:351](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L351)

#### accessToActions?

> `optional` **accessToActions?**: `string`

#### accessToData?

> `optional` **accessToData?**: `string`

#### attackConstraints?

> `optional` **attackConstraints?**: `string`

#### competitors?

> `optional` **competitors?**: `string`

#### connectedSystems?

> `optional` **connectedSystems?**: `string`

#### criticalActions?

> `optional` **criticalActions?**: `string`

#### doesNotHaveAccessTo?

> `optional` **doesNotHaveAccessTo?**: `string`

#### exampleIdentifiers?

> `optional` **exampleIdentifiers?**: `string`

#### features?

> `optional` **features?**: `string`

#### forbiddenActions?

> `optional` **forbiddenActions?**: `string`

#### forbiddenData?

> `optional` **forbiddenData?**: `string`

#### forbiddenTopics?

> `optional` **forbiddenTopics?**: `string`

#### hasAccessTo?

> `optional` **hasAccessTo?**: `string`

#### industry?

> `optional` **industry?**: `string`

#### purpose?

> `optional` **purpose?**: `string`

#### redteamUser?

> `optional` **redteamUser?**: `string`

#### securityRequirements?

> `optional` **securityRequirements?**: `string`

#### sensitiveDataTypes?

> `optional` **sensitiveDataTypes?**: `string`

#### systemPrompt?

> `optional` **systemPrompt?**: `string`

#### userTypes?

> `optional` **userTypes?**: `string`

---

### defaultTest?

> `optional` **defaultTest?**: `TestCase`

Defined in: [redteam/types.ts:375](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L375)

---

### description

> **description**: `string`

Defined in: [redteam/types.ts:338](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L338)

---

### entities

> **entities**: `string`[]

Defined in: [redteam/types.ts:374](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L374)

---

### extensions?

> `optional` **extensions?**: `string`[]

Defined in: [redteam/types.ts:345](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L345)

---

### frameworks?

> `optional` **frameworks?**: (`"mitre:atlas"` \| `"nist:ai:measure"` \| `"owasp:api"` \| `"owasp:llm"` \| `"owasp:agentic"` \| `"eu:ai-act"` \| `"iso:42001"` \| `"gdpr"` \| `"dod:ai:ethics"`)[]

Defined in: [redteam/types.ts:344](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L344)

---

### language?

> `optional` **language?**: `string` \| `string`[]

Defined in: [redteam/types.ts:349](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L349)

---

### maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

Defined in: [redteam/types.ts:347](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L347)

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [redteam/types.ts:348](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L348)

---

### numTests?

> `optional` **numTests?**: `number`

Defined in: [redteam/types.ts:346](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L346)

---

### plugins

> **plugins**: ([`RedteamPlugin`](../type-aliases/RedteamPlugin.md) \| \{ `config?`: `any`; `id`: `string`; \})[]

Defined in: [redteam/types.ts:341](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L341)

---

### prompts

> **prompts**: `string`[]

Defined in: [redteam/types.ts:339](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L339)

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md)

Defined in: [redteam/types.ts:350](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L350)

---

### purpose?

> `optional` **purpose?**: `string`

Defined in: [redteam/types.ts:343](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L343)

---

### strategies

> **strategies**: [`RedteamStrategy`](../type-aliases/RedteamStrategy.md)[]

Defined in: [redteam/types.ts:342](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L342)

---

### target

> **target**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [redteam/types.ts:340](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L340)

---

### testGenerationInstructions?

> `optional` **testGenerationInstructions?**: `string`

Defined in: [redteam/types.ts:373](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L373)
