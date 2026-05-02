[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / SynthesizeOptions

# Interface: SynthesizeOptions

Defined in: [redteam/types.ts:286](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L286)

## Extends

- `CommonOptions`

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [redteam/types.ts:287](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L287)

---

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

Defined in: [redteam/types.ts:288](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L288)

---

### excludeTargetOutputFromAgenticAttackGeneration?

> `optional` **excludeTargetOutputFromAgenticAttackGeneration?**: `boolean`

Defined in: [redteam/types.ts:249](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L249)

#### Inherited from

`CommonOptions.excludeTargetOutputFromAgenticAttackGeneration`

---

### frameworks?

> `optional` **frameworks?**: (`"mitre:atlas"` \| `"nist:ai:measure"` \| `"owasp:api"` \| `"owasp:llm"` \| `"owasp:agentic"` \| `"eu:ai-act"` \| `"iso:42001"` \| `"gdpr"` \| `"dod:ai:ethics"`)[]

Defined in: [redteam/types.ts:245](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L245)

#### Inherited from

`CommonOptions.frameworks`

---

### injectVar?

> `optional` **injectVar?**: `string`

Defined in: [redteam/types.ts:237](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L237)

#### Inherited from

`CommonOptions.injectVar`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [redteam/types.ts:290](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L290)

---

### language?

> `optional` **language?**: `string` \| `string`[]

Defined in: [redteam/types.ts:291](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L291)

#### Overrides

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

Defined in: [redteam/types.ts:292](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L292)

#### Overrides

`CommonOptions.maxConcurrency`

---

### numTests

> **numTests**: `number`

Defined in: [redteam/types.ts:293](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L293)

#### Overrides

`CommonOptions.numTests`

---

### plugins

> **plugins**: `ConfigurableObject` & `WithNumTests` & `object` & `object`[]

Defined in: [redteam/types.ts:294](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L294)

#### Overrides

`CommonOptions.plugins`

---

### prompts

> **prompts**: \[`string`, `...string[]`\]

Defined in: [redteam/types.ts:295](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L295)

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

### sharing?

> `optional` **sharing?**: `boolean`

Defined in: [redteam/types.ts:248](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L248)

#### Inherited from

`CommonOptions.sharing`

---

### showProgressBar?

> `optional` **showProgressBar?**: `boolean`

Defined in: [redteam/types.ts:298](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L298)

---

### strategies

> **strategies**: [`RedteamStrategyObject`](../type-aliases/RedteamStrategyObject.md)[]

Defined in: [redteam/types.ts:296](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L296)

#### Overrides

`CommonOptions.strategies`

---

### targetIds

> **targetIds**: `string`[]

Defined in: [redteam/types.ts:297](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L297)

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
