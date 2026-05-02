[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamCliGenerateOptions

# Interface: RedteamCliGenerateOptions

Defined in: [redteam/types.ts:257](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L257)

## Extends

- `CommonOptions`

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [redteam/types.ts:271](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L271)

---

### burpEscapeJson?

> `optional` **burpEscapeJson?**: `boolean`

Defined in: [redteam/types.ts:272](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L272)

---

### cache

> **cache**: `boolean`

Defined in: [redteam/types.ts:258](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L258)

---

### config?

> `optional` **config?**: `string`

Defined in: [redteam/types.ts:259](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L259)

---

### configFromCloud?

> `optional` **configFromCloud?**: `any`

Defined in: [redteam/types.ts:275](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L275)

---

### contexts?

> `optional` **contexts?**: [`RedteamContext`](RedteamContext.md)[]

Defined in: [redteam/types.ts:243](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L243)

#### Inherited from

`CommonOptions.contexts`

---

### defaultConfig

> **defaultConfig**: `Record`\<`string`, `unknown`\>

Defined in: [redteam/types.ts:261](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L261)

---

### defaultConfigPath?

> `optional` **defaultConfigPath?**: `string`

Defined in: [redteam/types.ts:262](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L262)

---

### delay?

> `optional` **delay?**: `number`

Defined in: [redteam/types.ts:246](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L246)

#### Inherited from

`CommonOptions.delay`

---

### description?

> `optional` **description?**: `string`

Defined in: [redteam/types.ts:263](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L263)

---

### envFile?

> `optional` **envFile?**: `string`

Defined in: [redteam/types.ts:264](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L264)

---

### excludeTargetOutputFromAgenticAttackGeneration?

> `optional` **excludeTargetOutputFromAgenticAttackGeneration?**: `boolean`

Defined in: [redteam/types.ts:249](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L249)

#### Inherited from

`CommonOptions.excludeTargetOutputFromAgenticAttackGeneration`

---

### force?

> `optional` **force?**: `boolean`

Defined in: [redteam/types.ts:267](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L267)

---

### frameworks?

> `optional` **frameworks?**: (`"mitre:atlas"` \| `"nist:ai:measure"` \| `"owasp:api"` \| `"owasp:llm"` \| `"owasp:agentic"` \| `"eu:ai-act"` \| `"iso:42001"` \| `"gdpr"` \| `"dod:ai:ethics"`)[]

Defined in: [redteam/types.ts:245](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L245)

#### Inherited from

`CommonOptions.frameworks`

---

### injectVar?

> `optional` **injectVar?**: `string`

Defined in: [redteam/types.ts:237](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L237)

#### Inherited from

`CommonOptions.injectVar`

---

### inRedteamRun?

> `optional` **inRedteamRun?**: `boolean`

Defined in: [redteam/types.ts:269](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L269)

---

### language?

> `optional` **language?**: `string` \| `string`[]

Defined in: [redteam/types.ts:238](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L238)

#### Inherited from

`CommonOptions.language`

---

### liveRedteamConfig?

> `optional` **liveRedteamConfig?**: [`RedteamObjectConfig`](../type-aliases/RedteamObjectConfig.md)

Defined in: [redteam/types.ts:274](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L274)

---

### maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

Defined in: [redteam/types.ts:251](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L251)

#### Inherited from

`CommonOptions.maxCharsPerMessage`

---

### maxConcurrency?

> `optional` **maxConcurrency?**: `number`

Defined in: [redteam/types.ts:265](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L265)

#### Overrides

`CommonOptions.maxConcurrency`

---

### numTests?

> `optional` **numTests?**: `number`

Defined in: [redteam/types.ts:239](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L239)

#### Inherited from

`CommonOptions.numTests`

---

### output?

> `optional` **output?**: `string`

Defined in: [redteam/types.ts:266](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L266)

---

### plugins?

> `optional` **plugins?**: [`RedteamPluginObject`](../type-aliases/RedteamPluginObject.md)[]

Defined in: [redteam/types.ts:240](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L240)

#### Inherited from

`CommonOptions.plugins`

---

### progressBar?

> `optional` **progressBar?**: `boolean`

Defined in: [redteam/types.ts:273](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L273)

---

### provider?

> `optional` **provider?**: `string` \| [`ApiProvider`](ApiProvider.md) \| [`ProviderOptions`](ProviderOptions.md)

Defined in: [redteam/types.ts:241](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L241)

#### Inherited from

`CommonOptions.provider`

---

### purpose?

> `optional` **purpose?**: `string`

Defined in: [redteam/types.ts:242](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L242)

#### Inherited from

`CommonOptions.purpose`

---

### remote?

> `optional` **remote?**: `boolean`

Defined in: [redteam/types.ts:247](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L247)

#### Inherited from

`CommonOptions.remote`

---

### sharing?

> `optional` **sharing?**: `boolean`

Defined in: [redteam/types.ts:248](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L248)

#### Inherited from

`CommonOptions.sharing`

---

### strategies?

> `optional` **strategies?**: [`RedteamStrategy`](../type-aliases/RedteamStrategy.md)[]

Defined in: [redteam/types.ts:244](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L244)

#### Inherited from

`CommonOptions.strategies`

---

### strict?

> `optional` **strict?**: `boolean`

Defined in: [redteam/types.ts:276](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L276)

---

### target?

> `optional` **target?**: `string`

Defined in: [redteam/types.ts:260](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L260)

---

### testGenerationInstructions?

> `optional` **testGenerationInstructions?**: `string`

Defined in: [redteam/types.ts:250](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L250)

#### Inherited from

`CommonOptions.testGenerationInstructions`

---

### tracing?

> `optional` **tracing?**: [`TracingConfig`](TracingConfig.md)

Defined in: [redteam/types.ts:253](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L253)

#### Inherited from

`CommonOptions.tracing`

---

### verbose?

> `optional` **verbose?**: `boolean`

Defined in: [redteam/types.ts:270](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L270)

---

### write

> **write**: `boolean`

Defined in: [redteam/types.ts:268](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L268)
