[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderResponse

# Interface: ProviderResponse

Defined in: [types/providers.ts:161](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L161)

## Properties

### audio?

> `optional` **audio?**: `object`

Defined in: [types/providers.ts:231](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L231)

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

Defined in: [types/providers.ts:162](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L162)

---

### conversationEnded?

> `optional` **conversationEnded?**: `boolean`

Defined in: [types/providers.ts:222](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L222)

Indicates the target intentionally ended the active conversation/session.
Multi-turn redteam strategies can use this to stop probing gracefully.

---

### conversationEndReason?

> `optional` **conversationEndReason?**: `string`

Defined in: [types/providers.ts:227](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L227)

Optional machine-readable reason explaining why the conversation ended.
Example: `thread_closed`.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:163](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L163)

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:164](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L164)

---

### finishReason?

> `optional` **finishReason?**: `string`

Defined in: [types/providers.ts:230](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L230)

---

### format?

> `optional` **format?**: `string`

Defined in: [types/providers.ts:182](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L182)

Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).

---

### guardrails?

> `optional` **guardrails?**: [`GuardrailResponse`](GuardrailResponse.md)

Defined in: [types/providers.ts:229](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L229)

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/providers.ts:256](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L256)

---

### inputMaterialization?

> `optional` **inputMaterialization?**: `Record`\<`string`, `unknown`\>

Defined in: [types/providers.ts:210](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L210)

Input materialization metadata returned by a remote Promptfoo server.

---

### isBase64?

> `optional` **isBase64?**: `boolean`

Defined in: [types/providers.ts:178](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L178)

Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.

---

### isRefusal?

> `optional` **isRefusal?**: `boolean`

Defined in: [types/providers.ts:217](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L217)

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:184](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L184)

---

### logProbs?

> `optional` **logProbs?**: `number`[]

Defined in: [types/providers.ts:183](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L183)

---

### materializationHandled?

> `optional` **materializationHandled?**: `boolean`

Defined in: [types/providers.ts:169](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L169)

Indicates that a remote Promptfoo server already materialized multi-input vars
for this response. When true, callers must not re-materialize locally.

---

### materializedVars?

> `optional` **materializedVars?**: `Record`\<`string`, `string`\>

Defined in: [types/providers.ts:173](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L173)

Materialized per-input vars returned by a remote Promptfoo server.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:185](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L185)

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

Defined in: [types/providers.ts:206](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L206)

---

### prompt?

> `optional` **prompt?**: `string` \| [`ChatMessage`](ChatMessage.md)[]

Defined in: [types/providers.ts:204](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L204)

The actual prompt sent to the LLM. If set by a provider, this overrides
the rendered prompt for display and assertions.

Useful for providers that dynamically generate or modify prompts
(e.g., GenAIScript, multi-turn strategies, agent frameworks).

Can be a simple string or an array of chat messages.

---

### providerTransformedOutput?

> `optional` **providerTransformedOutput?**: `any`

Defined in: [types/providers.ts:215](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L215)

Output after provider-level transform. Used by contextTransform to ensure
it operates on provider-normalized output, independent of test transforms.

---

### raw?

> `optional` **raw?**: `any`

Defined in: [types/providers.ts:205](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L205)

---

### sessionId?

> `optional` **sessionId?**: `string`

Defined in: [types/providers.ts:228](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L228)

---

### tokenUsage?

> `optional` **tokenUsage?**: `object`

Defined in: [types/providers.ts:216](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L216)

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

Defined in: [types/providers.ts:242](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L242)

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
