---
title: 'Interface: EvaluateTableOutput'
description: 'One provider output cell in an eval table.'
---

## Import

```ts
import type { EvaluateTableOutput } from 'promptfoo';
```

Defined in: [types/index.ts:538](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L538)

One provider output cell in an eval table.

## Example

```ts
import { ResultFailureReason } from 'promptfoo';

const output: EvaluateTableOutput = {
  cost: 0,
  failureReason: ResultFailureReason.NONE,
  id: 'result-1',
  latencyMs: 120,
  namedScores: { mentions_name: 1 },
  pass: true,
  prompt: 'Hello {{name}}',
  score: 1,
  testCase: { vars: { name: 'Ada' } },
  text: 'Hello Ada',
};
```

## Properties

### audio?

> `optional` **audio?**: [`AudioOutput`](AudioOutput.md)

Defined in: [types/index.ts:572](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L572)

Audio attachment associated with this output, when present.

---

### cost

> **cost**: `number`

Defined in: [types/index.ts:540](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L540)

Estimated cost attributed to this provider result.

---

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [types/index.ts:570](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L570)

Error message when this output failed before normal grading.

---

### failureReason

> **failureReason**: `ResultFailureReason`

Defined in: [types/index.ts:542](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L542)

Failure category used when rendering an error or failed assertion.

---

### gradingResult?

> `optional` **gradingResult?**: [`GradingResult`](GradingResult.md) \| `null`

Defined in: [types/index.ts:544](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L544)

Assertion result for this provider output, when grading has run.

---

### id

> **id**: `string`

Defined in: [types/index.ts:546](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L546)

Stable result id.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/index.ts:576](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L576)

Image attachments associated with this output, when present.

---

### latencyMs

> **latencyMs**: `number`

Defined in: [types/index.ts:548](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L548)

Provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:550](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L550)

Additional result metadata preserved for advanced consumers.

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:552](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L552)

Named metric scores emitted by assertions for this output.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:554](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L554)

Whether this output passed all configured assertions.

---

### prompt

> **prompt**: `string`

Defined in: [types/index.ts:556](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L556)

Rendered prompt associated with this provider output.

---

### provider?

> `optional` **provider?**: `string`

Defined in: [types/index.ts:558](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L558)

Provider id or label shown for this output.

---

### response?

> `optional` **response?**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [types/index.ts:560](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L560)

Raw provider response returned before table normalization.

---

### score

> **score**: `number`

Defined in: [types/index.ts:562](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L562)

Aggregate score for this output.

---

### testCase

> **testCase**: `object`

Defined in: [types/index.ts:564](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L564)

Test case associated with this output.

#### assert?

> `optional` **assert?**: (\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"agent-rubric"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-agent-rubric"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]

Assertions to run against the provider output.

#### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Optional custom scoring function for aggregating assertion results.

#### description?

> `optional` **description?**: `string`

Optional human-readable description of what the test covers.

#### metadata?

> `optional` **metadata?**: `object`

Arbitrary metadata attached to the test case. Known red-team fields are
typed, and extra keys are preserved for custom integrations.

##### Index Signature

\[`key`: `string`\]: `any`

##### metadata.pluginConfig?

> `optional` **pluginConfig?**: [`PluginConfig`](PluginConfig.md)

Advanced red-team plugin config carried on generated test cases.

##### metadata.strategyConfig?

> `optional` **strategyConfig?**: [`StrategyConfig`](StrategyConfig.md)

Advanced red-team strategy config carried on generated test cases.

#### options?

> `optional` **options?**: `object`

##### Index Signature

\[`key`: `string`\]: `any`

##### options.disableConversationVar?

> `optional` **disableConversationVar?**: `boolean`

Do not include the implicit `_conversation` variable.

##### options.disableDefaultAsserts?

> `optional` **disableDefaultAsserts?**: `boolean`

Skip `defaultTest` assertions while still inheriting other defaults.

##### options.disableVarExpansion?

> `optional` **disableVarExpansion?**: `boolean`

Do not expand array-valued vars into multiple eval cases.

##### options.factuality?

> `optional` **factuality?**: `object`

Score mapping used by factuality-oriented graders.

##### options.factuality.agree?

> `optional` **agree?**: `number`

Score awarded when answer and reference agree factually.

##### options.factuality.differButFactual?

> `optional` **differButFactual?**: `number`

Score awarded when wording differs but remains factual.

##### options.factuality.disagree?

> `optional` **disagree?**: `number`

Score awarded when answer and reference disagree factually.

##### options.factuality.subset?

> `optional` **subset?**: `number`

Score awarded when the answer is a factual subset of the expected answer.

##### options.factuality.superset?

> `optional` **superset?**: `number`

Score awarded when the answer is a factual superset of the expected answer.

##### options.postprocess?

> `optional` **postprocess?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

###### Deprecated

in > 0.38.0. Use `transform` instead.

##### options.prefix?

> `optional` **prefix?**: `string`

##### options.provider?

> `optional` **provider?**: `any`

Provider override used by model-graded assertions.

##### options.rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Rubric prompt override used by model-graded assertions.

##### options.runSerially?

> `optional` **runSerially?**: `boolean`

Run this test serially even when the eval otherwise uses concurrency.

##### options.storeOutputAs?

> `optional` **storeOutputAs?**: `string`

Name of the variable that should receive this test case's output.

##### options.suffix?

> `optional` **suffix?**: `string`

##### options.transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Transform provider output before assertions run.

##### options.transformVars?

> `optional` **transformVars?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Transform vars before prompt rendering.

#### prompts?

> `optional` **prompts?**: `string`[]

Prompt labels or ids this test should run against; omitted means all prompts.

#### provider?

> `optional` **provider?**: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEARER_TOKEN_BEDROCK?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `FIREWORKS_API_BASE_URL?`: `string`; `FIREWORKS_API_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MINIMAX_API_KEY?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MLFLOW_GATEWAY_API_KEY?`: `string`; `MLFLOW_GATEWAY_URL?`: `string`; `MODELSLAB_API_KEY?`: `string`; `N8N_API_KEY?`: `string`; `NOVITA_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `NVIDIA_API_BASE_URL?`: `string`; `NVIDIA_API_KEY?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `ORCAROUTER_API_KEY?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: ...[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: ...[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}

Provider override for this specific test case.

#### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

#### providers?

> `optional` **providers?**: `string`[]

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

#### threshold?

> `optional` **threshold?**: `number`

Required aggregate score for the test case; without one, the case is graded pass/fail.

#### vars?

> `optional` **vars?**: `Vars`

Flattened variables used for this exact eval row.

---

### text

> **text**: `string`

Defined in: [types/index.ts:566](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L566)

Rendered output text shown in table views.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/index.ts:568](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L568)

Token usage attributed to this output.

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [types/index.ts:574](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L574)

Video attachment associated with this output, when present.
