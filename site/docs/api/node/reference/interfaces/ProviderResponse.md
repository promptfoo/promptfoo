[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderResponse

# Interface: ProviderResponse

Defined in: [types/providers.ts:226](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L226)

Response shape returned by custom providers.

## Properties

### audio?

> `optional` **audio?**: `object`

Defined in: [types/providers.ts:306](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L306)

#### blobRef?

> `optional` **blobRef?**: `BlobRef`

#### channels?

> `optional` **channels?**: `number`

#### data?

> `optional` **data?**: `string`

#### duration?

> `optional` **duration?**: `number`

#### expiresAt?

> `optional` **expiresAt?**: `number`

#### format?

> `optional` **format?**: `string`

#### id?

> `optional` **id?**: `string`

#### sampleRate?

> `optional` **sampleRate?**: `number`

#### transcript?

> `optional` **transcript?**: `string`

---

### cached?

> `optional` **cached?**: `boolean`

Defined in: [types/providers.ts:228](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L228)

Whether the response came from cache.

---

### conversationEnded?

> `optional` **conversationEnded?**: `boolean`

Defined in: [types/providers.ts:297](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L297)

Indicates the target intentionally ended the active conversation/session.
Multi-turn redteam strategies can use this to stop probing gracefully.

---

### conversationEndReason?

> `optional` **conversationEndReason?**: `string`

Defined in: [types/providers.ts:302](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L302)

Optional machine-readable reason explaining why the conversation ended.
Example: `thread_closed`.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:230](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L230)

Estimated request cost when the provider can report it.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:232](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L232)

Error message when the provider call failed without throwing.

---

### finishReason?

> `optional` **finishReason?**: `string`

Defined in: [types/providers.ts:305](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L305)

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:250](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L250)

Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).

---

### guardrails?

> `optional` **guardrails?**: `GuardrailResponse`

Defined in: [types/providers.ts:304](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L304)

---

### images?

> `optional` **images?**: `ImageOutput`[]

Defined in: [types/providers.ts:331](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L331)

---

### inputMaterialization?

> `optional` **inputMaterialization?**: `Record`\<`string`, `unknown`\>

Defined in: [types/providers.ts:283](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L283)

Input materialization metadata returned by a remote Promptfoo server.

---

### isBase64?

> `optional` **isBase64?**: `boolean`

Defined in: [types/providers.ts:246](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L246)

Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.

---

### isRefusal?

> `optional` **isRefusal?**: `boolean`

Defined in: [types/providers.ts:292](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L292)

Whether the provider identified the output as a refusal.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:254](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L254)

End-to-end provider latency in milliseconds.

---

### logProbs?

> `optional` **logProbs?**: `number`[]

Defined in: [types/providers.ts:252](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L252)

Token-level log probabilities when exposed by the provider.

---

### materializationHandled?

> `optional` **materializationHandled?**: `boolean`

Defined in: [types/providers.ts:237](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L237)

Indicates that a remote Promptfoo server already materialized multi-input vars
for this response. When true, callers must not re-materialize locally.

---

### materializedVars?

> `optional` **materializedVars?**: `Record`\<`string`, `string`\>

Defined in: [types/providers.ts:241](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L241)

Materialized per-input vars returned by a remote Promptfoo server.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:256](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L256)

Additional provider-specific metadata preserved on the result row.

#### Index Signature

\[`key`: `string`\]: `any`

#### http?

> `optional` **http?**: `object`

##### http.headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

##### http.requestHeaders?

> `optional` **requestHeaders?**: `Record`\<`string`, `string`\>

##### http.status

> **status**: `number`

##### http.statusText

> **statusText**: `string`

#### redteamFinalPrompt?

> `optional` **redteamFinalPrompt?**: `string`

---

### output?

> `optional` **output?**: `any`

Defined in: [types/providers.ts:279](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L279)

Main provider output consumed by assertions and result rendering.

---

### prompt?

> `optional` **prompt?**: `string` \| `ChatMessage`[]

Defined in: [types/providers.ts:275](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L275)

The actual prompt sent to the LLM. If set by a provider, this overrides
the rendered prompt for display and assertions.

Useful for providers that dynamically generate or modify prompts
(e.g., GenAIScript, multi-turn strategies, agent frameworks).

Can be a simple string or an array of chat messages.

---

### providerTransformedOutput?

> `optional` **providerTransformedOutput?**: `any`

Defined in: [types/providers.ts:288](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L288)

Output after provider-level transform. Used by contextTransform to ensure
it operates on provider-normalized output, independent of test transforms.

---

### raw?

> `optional` **raw?**: `any`

Defined in: [types/providers.ts:277](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L277)

Raw provider payload retained for advanced consumers.

---

### sessionId?

> `optional` **sessionId?**: `string`

Defined in: [types/providers.ts:303](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L303)

---

### tokenUsage?

> `optional` **tokenUsage?**: `object`

Defined in: [types/providers.ts:290](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L290)

Provider-reported token usage.

#### assertions?

> `optional` **assertions?**: `object`

##### assertions.cached?

> `optional` **cached?**: `number`

##### assertions.completion?

> `optional` **completion?**: `number`

##### assertions.completionDetails?

> `optional` **completionDetails?**: `object`

##### assertions.completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

##### assertions.completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### assertions.completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### assertions.completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### assertions.completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

##### assertions.numRequests?

> `optional` **numRequests?**: `number`

##### assertions.prompt?

> `optional` **prompt?**: `number`

##### assertions.total?

> `optional` **total?**: `number`

#### cached?

> `optional` **cached?**: `number`

#### completion?

> `optional` **completion?**: `number`

#### completionDetails?

> `optional` **completionDetails?**: `object`

##### completionDetails.acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

##### completionDetails.cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

##### completionDetails.cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

##### completionDetails.reasoning?

> `optional` **reasoning?**: `number`

##### completionDetails.rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

#### numRequests?

> `optional` **numRequests?**: `number`

#### prompt?

> `optional` **prompt?**: `number`

#### total?

> `optional` **total?**: `number`

---

### video?

> `optional` **video?**: `object`

Defined in: [types/providers.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L317)

#### aspectRatio?

> `optional` **aspectRatio?**: `string`

#### blobRef?

> `optional` **blobRef?**: `BlobRef`

#### duration?

> `optional` **duration?**: `number`

#### format?

> `optional` **format?**: `string`

#### id?

> `optional` **id?**: `string`

#### model?

> `optional` **model?**: `string`

#### resolution?

> `optional` **resolution?**: `string`

#### size?

> `optional` **size?**: `string`

#### spritesheet?

> `optional` **spritesheet?**: `string`

#### storageRef?

> `optional` **storageRef?**: `object`

##### storageRef.key?

> `optional` **key?**: `string`

#### thumbnail?

> `optional` **thumbnail?**: `string`

#### url?

> `optional` **url?**: `string`
