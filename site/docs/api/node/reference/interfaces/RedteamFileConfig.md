[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamFileConfig

# Interface: RedteamFileConfig

Defined in: [redteam/types.ts:279](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L279)

## Extends

- `CommonOptions`

## Properties

### contexts?

> `optional` **contexts?**: [`RedteamContext`](RedteamContext.md)[]

Defined in: [redteam/types.ts:243](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L243)

#### Inherited from

`CommonOptions.contexts`

---

### delay?

> `optional` **delay?**: `number`

Defined in: [redteam/types.ts:246](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L246)

#### Inherited from

`CommonOptions.delay`

---

### entities?

> `optional` **entities?**: `string`[]

Defined in: [redteam/types.ts:280](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L280)

---

### excludeTargetOutputFromAgenticAttackGeneration?

> `optional` **excludeTargetOutputFromAgenticAttackGeneration?**: `boolean`

Defined in: [redteam/types.ts:282](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L282)

#### Overrides

`CommonOptions.excludeTargetOutputFromAgenticAttackGeneration`

---

### frameworks?

> `optional` **frameworks?**: (`"mitre:atlas"` \| `"nist:ai:measure"` \| `"owasp:api"` \| `"owasp:llm"` \| `"owasp:agentic"` \| `"eu:ai-act"` \| `"iso:42001"` \| `"gdpr"` \| `"dod:ai:ethics"`)[]

Defined in: [redteam/types.ts:245](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L245)

#### Inherited from

`CommonOptions.frameworks`

---

### graderExamples?

> `optional` **graderExamples?**: `object`[]

Defined in: [redteam/types.ts:283](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L283)

#### output

> **output**: `string`

#### pass

> **pass**: `boolean`

#### reason

> **reason**: `string`

#### score

> **score**: `number`

---

### injectVar?

> `optional` **injectVar?**: `string`

Defined in: [redteam/types.ts:237](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L237)

#### Inherited from

`CommonOptions.injectVar`

---

### language?

> `optional` **language?**: `string` \| `string`[]

Defined in: [redteam/types.ts:238](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L238)

#### Inherited from

`CommonOptions.language`

---

### maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

Defined in: [redteam/types.ts:251](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L251)

#### Inherited from

`CommonOptions.maxCharsPerMessage`

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [redteam/types.ts:252](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L252)

#### Inherited from

`CommonOptions.maxConcurrency`

---

### numTests?

> `optional` **numTests?**: `number`

Defined in: [redteam/types.ts:239](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L239)

#### Inherited from

`CommonOptions.numTests`

---

### plugins?

> `optional` **plugins?**: [`RedteamPluginObject`](../type-aliases/RedteamPluginObject.md)[]

Defined in: [redteam/types.ts:240](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L240)

#### Inherited from

`CommonOptions.plugins`

---

### provider?

> `optional` **provider?**: `string` \| [`ApiProvider`](ApiProvider.md) \| [`ProviderOptions`](ProviderOptions.md)

Defined in: [redteam/types.ts:241](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L241)

#### Inherited from

`CommonOptions.provider`

---

### purpose?

> `optional` **purpose?**: `string`

Defined in: [redteam/types.ts:242](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L242)

#### Inherited from

`CommonOptions.purpose`

---

### remote?

> `optional` **remote?**: `boolean`

Defined in: [redteam/types.ts:247](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L247)

#### Inherited from

`CommonOptions.remote`

---

### severity?

> `optional` **severity?**: `Record`\<`Plugin`, `Severity`\>

Defined in: [redteam/types.ts:281](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L281)

---

### sharing?

> `optional` **sharing?**: `boolean`

Defined in: [redteam/types.ts:248](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L248)

#### Inherited from

`CommonOptions.sharing`

---

### strategies?

> `optional` **strategies?**: [`RedteamStrategy`](../type-aliases/RedteamStrategy.md)[]

Defined in: [redteam/types.ts:244](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L244)

#### Inherited from

`CommonOptions.strategies`

---

### testGenerationInstructions?

> `optional` **testGenerationInstructions?**: `string`

Defined in: [redteam/types.ts:250](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L250)

#### Inherited from

`CommonOptions.testGenerationInstructions`

---

### tracing?

> `optional` **tracing?**: [`TracingConfig`](TracingConfig.md)

Defined in: [redteam/types.ts:253](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L253)

#### Inherited from

`CommonOptions.tracing`
