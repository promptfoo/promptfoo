[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RunEvalOptions

# Interface: RunEvalOptions

Defined in: [types/index.ts:202](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L202)

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [types/index.ts:232](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L232)

AbortSignal that can be used to cancel the evaluation
This is passed to the provider's callApi function

---

### concurrency?

> `optional` **concurrency?**: `number`

Defined in: [types/index.ts:220](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L220)

---

### conversations?

> `optional` **conversations?**: [`EvalConversations`](../type-aliases/EvalConversations.md)

Defined in: [types/index.ts:216](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L216)

---

### deferGrading?

> `optional` **deferGrading?**: `boolean`

Defined in: [types/index.ts:244](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L244)

Defers assertion grading so the evaluator can group model-graded provider
calls across rows. Intended for serial evaluation orchestration.

---

### delay

> **delay**: `number`

Defined in: [types/index.ts:205](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L205)

---

### evalId?

> `optional` **evalId?**: `string`

Defined in: [types/index.ts:226](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L226)

Evaluation ID for tracking blob references in the database.
When set, allows blob storage to record references for access control.

---

### evaluateOptions?

> `optional` **evaluateOptions?**: [`EvaluateOptions`](../type-aliases/EvaluateOptions.md)

Defined in: [types/index.ts:210](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L210)

---

### isRedteam

> **isRedteam**: `boolean`

Defined in: [types/index.ts:218](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L218)

---

### nunjucksFilters?

> `optional` **nunjucksFilters?**: [`NunjucksFilterMap`](../type-aliases/NunjucksFilterMap.md)

Defined in: [types/index.ts:209](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L209)

---

### prompt

> **prompt**: [`Prompt`](Prompt.md)

Defined in: [types/index.ts:204](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L204)

---

### promptIdx

> **promptIdx**: `number`

Defined in: [types/index.ts:213](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L213)

---

### provider

> **provider**: [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:203](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L203)

---

### providerCallQueue?

> `optional` **providerCallQueue?**: [`ProviderCallQueueRef`](ProviderCallQueueRef.md)

Defined in: [types/index.ts:249](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L249)

Queue used while deferred grading is active to group grader provider calls.

---

### rateLimitRegistry?

> `optional` **rateLimitRegistry?**: [`RateLimitRegistryRef`](RateLimitRegistryRef.md)

Defined in: [types/index.ts:238](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L238)

Rate limit registry for adaptive concurrency control.
When provided, provider calls are wrapped with rate limiting and retry logic.

---

### registers?

> `optional` **registers?**: [`EvalRegisters`](../type-aliases/EvalRegisters.md)

Defined in: [types/index.ts:217](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L217)

---

### repeatIndex

> **repeatIndex**: `number`

Defined in: [types/index.ts:214](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L214)

---

### test

> **test**: `object`

Defined in: [types/index.ts:207](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L207)

#### assert?

> `optional` **assert?**: (\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: [`AssertionValue`](../type-aliases/AssertionValue.md); `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]

#### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

#### description?

> `optional` **description?**: `string`

#### metadata?

> `optional` **metadata?**: `object`

##### Index Signature

\[`key`: `string`\]: `any`

##### metadata.pluginConfig?

> `optional` **pluginConfig?**: `object`

##### metadata.pluginConfig.\_\_nonce?

> `optional` **\_\_nonce?**: `number`

##### metadata.pluginConfig.examples?

> `optional` **examples?**: `string`[]

##### metadata.pluginConfig.excludeStrategies?

> `optional` **excludeStrategies?**: `string`[]

##### metadata.pluginConfig.graderExamples?

> `optional` **graderExamples?**: `object`[]

##### metadata.pluginConfig.graderGuidance?

> `optional` **graderGuidance?**: `string`

##### metadata.pluginConfig.indirectInjectionVar?

> `optional` **indirectInjectionVar?**: `string`

##### metadata.pluginConfig.inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: ...; `injectionPlacements?`: ...; `inputPurpose?`: ...; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

##### metadata.pluginConfig.intendedResults?

> `optional` **intendedResults?**: `string`[]

##### metadata.pluginConfig.intent?

> `optional` **intent?**: `string` \| (`string` \| `string`[])[]

##### metadata.pluginConfig.language?

> `optional` **language?**: `string` \| `string`[]

##### metadata.pluginConfig.maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

##### metadata.pluginConfig.mentions?

> `optional` **mentions?**: `boolean`

##### metadata.pluginConfig.modifiers?

> `optional` **modifiers?**: `Record`\<`string`, `unknown`\>

##### metadata.pluginConfig.multilingual?

> `optional` **multilingual?**: `boolean`

##### metadata.pluginConfig.mustNotExistPath?

> `optional` **mustNotExistPath?**: `string`

##### metadata.pluginConfig.mustNotExistPaths?

> `optional` **mustNotExistPaths?**: `string`[]

##### metadata.pluginConfig.name?

> `optional` **name?**: `string`

##### metadata.pluginConfig.networkAllowedHost?

> `optional` **networkAllowedHost?**: `string`

##### metadata.pluginConfig.networkAllowedHosts?

> `optional` **networkAllowedHosts?**: `string`[]

##### metadata.pluginConfig.networkAllowedUrl?

> `optional` **networkAllowedUrl?**: `string`

##### metadata.pluginConfig.networkAllowedUrls?

> `optional` **networkAllowedUrls?**: `string`[]

##### metadata.pluginConfig.networkEgressHost?

> `optional` **networkEgressHost?**: `string`

##### metadata.pluginConfig.networkEgressHosts?

> `optional` **networkEgressHosts?**: `string`[]

##### metadata.pluginConfig.networkEgressReceipt?

> `optional` **networkEgressReceipt?**: `string`

##### metadata.pluginConfig.networkEgressReceipts?

> `optional` **networkEgressReceipts?**: `string`[]

##### metadata.pluginConfig.networkEgressUrl?

> `optional` **networkEgressUrl?**: `string`

##### metadata.pluginConfig.networkEgressUrls?

> `optional` **networkEgressUrls?**: `string`[]

##### metadata.pluginConfig.networkScanPath?

> `optional` **networkScanPath?**: `string`

##### metadata.pluginConfig.networkScanPaths?

> `optional` **networkScanPaths?**: `string`[]

##### metadata.pluginConfig.networkTrapHost?

> `optional` **networkTrapHost?**: `string`

##### metadata.pluginConfig.networkTrapHosts?

> `optional` **networkTrapHosts?**: `string`[]

##### metadata.pluginConfig.networkTrapLogPath?

> `optional` **networkTrapLogPath?**: `string`

##### metadata.pluginConfig.networkTrapLogPaths?

> `optional` **networkTrapLogPaths?**: `string`[]

##### metadata.pluginConfig.networkTrapUrl?

> `optional` **networkTrapUrl?**: `string`

##### metadata.pluginConfig.networkTrapUrls?

> `optional` **networkTrapUrls?**: `string`[]

##### metadata.pluginConfig.networkWorkspacePath?

> `optional` **networkWorkspacePath?**: `string`

##### metadata.pluginConfig.networkWorkspacePaths?

> `optional` **networkWorkspacePaths?**: `string`[]

##### metadata.pluginConfig.outsideWriteAllowedPath?

> `optional` **outsideWriteAllowedPath?**: `string`

##### metadata.pluginConfig.outsideWriteAllowedPaths?

> `optional` **outsideWriteAllowedPaths?**: `string`[]

##### metadata.pluginConfig.outsideWriteExpectedSha256?

> `optional` **outsideWriteExpectedSha256?**: `string`

##### metadata.pluginConfig.outsideWriteHostPath?

> `optional` **outsideWriteHostPath?**: `string`

##### metadata.pluginConfig.outsideWriteHostPaths?

> `optional` **outsideWriteHostPaths?**: `string`[]

##### metadata.pluginConfig.outsideWriteMustNotExistPath?

> `optional` **outsideWriteMustNotExistPath?**: `string`

##### metadata.pluginConfig.outsideWriteMustNotExistPaths?

> `optional` **outsideWriteMustNotExistPaths?**: `string`[]

##### metadata.pluginConfig.outsideWritePath?

> `optional` **outsideWritePath?**: `string`

##### metadata.pluginConfig.outsideWritePaths?

> `optional` **outsideWritePaths?**: `string`[]

##### metadata.pluginConfig.outsideWritePathSha256?

> `optional` **outsideWritePathSha256?**: `string`

##### metadata.pluginConfig.outsideWriteProbeDir?

> `optional` **outsideWriteProbeDir?**: `string`

##### metadata.pluginConfig.outsideWriteProbeDirs?

> `optional` **outsideWriteProbeDirs?**: `string`[]

##### metadata.pluginConfig.outsideWriteSha256?

> `optional` **outsideWriteSha256?**: `string`

##### metadata.pluginConfig.policy?

> `optional` **policy?**: `string` \| \{ `id`: `string`; `name?`: `string`; `text?`: `string`; \}

##### metadata.pluginConfig.prompt?

> `optional` **prompt?**: `string`

##### metadata.pluginConfig.protectedFilePath?

> `optional` **protectedFilePath?**: `string`

##### metadata.pluginConfig.protectedFilePaths?

> `optional` **protectedFilePaths?**: `string`[]

##### metadata.pluginConfig.protectedWritePath?

> `optional` **protectedWritePath?**: `string`

##### metadata.pluginConfig.protectedWritePaths?

> `optional` **protectedWritePaths?**: `string`[]

##### metadata.pluginConfig.purpose?

> `optional` **purpose?**: `string`

##### metadata.pluginConfig.sandboxWritePath?

> `optional` **sandboxWritePath?**: `string`

##### metadata.pluginConfig.sandboxWritePaths?

> `optional` **sandboxWritePaths?**: `string`[]

##### metadata.pluginConfig.secretFilePath?

> `optional` **secretFilePath?**: `string`

##### metadata.pluginConfig.secretFilePaths?

> `optional` **secretFilePaths?**: `string`[]

##### metadata.pluginConfig.secretFileValue?

> `optional` **secretFileValue?**: `string`

##### metadata.pluginConfig.secretFileValues?

> `optional` **secretFileValues?**: `string`[]

##### metadata.pluginConfig.secretLocalFilePath?

> `optional` **secretLocalFilePath?**: `string`

##### metadata.pluginConfig.secretLocalFilePaths?

> `optional` **secretLocalFilePaths?**: `string`[]

##### metadata.pluginConfig.severity?

> `optional` **severity?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`

##### metadata.pluginConfig.ssrfFailThreshold?

> `optional` **ssrfFailThreshold?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"`

##### metadata.pluginConfig.systemPrompt?

> `optional` **systemPrompt?**: `string`

##### metadata.pluginConfig.targetIdentifiers?

> `optional` **targetIdentifiers?**: `string`[]

##### metadata.pluginConfig.targetSystems?

> `optional` **targetSystems?**: `string`[]

##### metadata.pluginConfig.targetUrls?

> `optional` **targetUrls?**: `string`[]

##### metadata.pluginConfig.verifierArtifactRoot?

> `optional` **verifierArtifactRoot?**: `string`

##### metadata.pluginConfig.verifierArtifactRoots?

> `optional` **verifierArtifactRoots?**: `string`[]

##### metadata.pluginConfig.verifierProbeDir?

> `optional` **verifierProbeDir?**: `string`

##### metadata.pluginConfig.verifierProbeDirs?

> `optional` **verifierProbeDirs?**: `string`[]

##### metadata.pluginConfig.workingDir?

> `optional` **workingDir?**: `string`

##### metadata.pluginConfig.workingDirectory?

> `optional` **workingDirectory?**: `string`

##### metadata.pluginConfig.workingDirectoryPath?

> `optional` **workingDirectoryPath?**: `string`

##### metadata.pluginConfig.workspacePath?

> `optional` **workspacePath?**: `string`

##### metadata.pluginConfig.workspacePaths?

> `optional` **workspacePaths?**: `string`[]

##### metadata.pluginConfig.workspaceRoot?

> `optional` **workspaceRoot?**: `string`

##### metadata.pluginConfig.workspaceRoots?

> `optional` **workspaceRoots?**: `string`[]

##### metadata.strategyConfig?

> `optional` **strategyConfig?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

##### metadata.strategyConfig.enabled?

> `optional` **enabled?**: `boolean`

##### metadata.strategyConfig.numTests?

> `optional` **numTests?**: `number`

##### metadata.strategyConfig.plugins?

> `optional` **plugins?**: `string`[]

#### options?

> `optional` **options?**: `object`

##### Index Signature

\[`key`: `string`\]: `any`

##### options.disableConversationVar?

> `optional` **disableConversationVar?**: `boolean`

##### options.disableDefaultAsserts?

> `optional` **disableDefaultAsserts?**: `boolean`

##### options.disableVarExpansion?

> `optional` **disableVarExpansion?**: `boolean`

##### options.factuality?

> `optional` **factuality?**: `object`

##### options.factuality.agree?

> `optional` **agree?**: `number`

##### options.factuality.differButFactual?

> `optional` **differButFactual?**: `number`

##### options.factuality.disagree?

> `optional` **disagree?**: `number`

##### options.factuality.subset?

> `optional` **subset?**: `number`

##### options.factuality.superset?

> `optional` **superset?**: `number`

##### options.postprocess?

> `optional` **postprocess?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

###### Deprecated

in > 0.38.0. Use `transform` instead.

##### options.prefix?

> `optional` **prefix?**: `string`

##### options.provider?

> `optional` **provider?**: `any`

##### options.rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

##### options.runSerially?

> `optional` **runSerially?**: `boolean`

##### options.storeOutputAs?

> `optional` **storeOutputAs?**: `string`

##### options.suffix?

> `optional` **suffix?**: `string`

##### options.transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

##### options.transformVars?

> `optional` **transformVars?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

#### prompts?

> `optional` **prompts?**: `string`[]

#### provider?

> `optional` **provider?**: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: ...[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](../type-aliases/CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: ...[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}

#### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

#### providers?

> `optional` **providers?**: `string`[]

#### threshold?

> `optional` **threshold?**: `number`

#### vars?

> `optional` **vars?**: [`Vars`](../type-aliases/Vars.md)

---

### testIdx

> **testIdx**: `number`

Defined in: [types/index.ts:212](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L212)

---

### testSuite?

> `optional` **testSuite?**: `object`

Defined in: [types/index.ts:208](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L208)

#### defaultTest?

> `optional` **defaultTest?**: `string` \| \{ `assert?`: (\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: [`AssertionValue`](../type-aliases/AssertionValue.md); `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]; `assertScoringFunction?`: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md); `metadata?`: \{\[`key`: `string`\]: `any`; `pluginConfig?`: \{ `__nonce?`: `number`; `examples?`: `string`[]; `excludeStrategies?`: `string`[]; `graderExamples?`: `object`[]; `graderGuidance?`: `string`; `indirectInjectionVar?`: `string`; `inputs?`: `Record`\<`string`, ... \| ...\>; `intendedResults?`: `string`[]; `intent?`: `string` \| (... \| ...)[]; `language?`: `string` \| `string`[]; `maxCharsPerMessage?`: `number`; `mentions?`: `boolean`; `modifiers?`: `Record`\<`string`, `unknown`\>; `multilingual?`: `boolean`; `mustNotExistPath?`: `string`; `mustNotExistPaths?`: `string`[]; `name?`: `string`; `networkAllowedHost?`: `string`; `networkAllowedHosts?`: `string`[]; `networkAllowedUrl?`: `string`; `networkAllowedUrls?`: `string`[]; `networkEgressHost?`: `string`; `networkEgressHosts?`: `string`[]; `networkEgressReceipt?`: `string`; `networkEgressReceipts?`: `string`[]; `networkEgressUrl?`: `string`; `networkEgressUrls?`: `string`[]; `networkScanPath?`: `string`; `networkScanPaths?`: `string`[]; `networkTrapHost?`: `string`; `networkTrapHosts?`: `string`[]; `networkTrapLogPath?`: `string`; `networkTrapLogPaths?`: `string`[]; `networkTrapUrl?`: `string`; `networkTrapUrls?`: `string`[]; `networkWorkspacePath?`: `string`; `networkWorkspacePaths?`: `string`[]; `outsideWriteAllowedPath?`: `string`; `outsideWriteAllowedPaths?`: `string`[]; `outsideWriteExpectedSha256?`: `string`; `outsideWriteHostPath?`: `string`; `outsideWriteHostPaths?`: `string`[]; `outsideWriteMustNotExistPath?`: `string`; `outsideWriteMustNotExistPaths?`: `string`[]; `outsideWritePath?`: `string`; `outsideWritePaths?`: `string`[]; `outsideWritePathSha256?`: `string`; `outsideWriteProbeDir?`: `string`; `outsideWriteProbeDirs?`: `string`[]; `outsideWriteSha256?`: `string`; `policy?`: `string` \| \{ `id`: `string`; `name?`: ... \| ...; `text?`: ... \| ...; \}; `prompt?`: `string`; `protectedFilePath?`: `string`; `protectedFilePaths?`: `string`[]; `protectedWritePath?`: `string`; `protectedWritePaths?`: `string`[]; `purpose?`: `string`; `sandboxWritePath?`: `string`; `sandboxWritePaths?`: `string`[]; `secretFilePath?`: `string`; `secretFilePaths?`: `string`[]; `secretFileValue?`: `string`; `secretFileValues?`: `string`[]; `secretLocalFilePath?`: `string`; `secretLocalFilePaths?`: `string`[]; `severity?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`; `ssrfFailThreshold?`: `"critical"` \| `"high"` \| `"medium"` \| `"low"`; `systemPrompt?`: `string`; `targetIdentifiers?`: `string`[]; `targetSystems?`: `string`[]; `targetUrls?`: `string`[]; `verifierArtifactRoot?`: `string`; `verifierArtifactRoots?`: `string`[]; `verifierProbeDir?`: `string`; `verifierProbeDirs?`: `string`[]; `workingDir?`: `string`; `workingDirectory?`: `string`; `workingDirectoryPath?`: `string`; `workspacePath?`: `string`; `workspacePaths?`: `string`[]; `workspaceRoot?`: `string`; `workspaceRoots?`: `string`[]; \}; `strategyConfig?`: \{\[`key`: `string`\]: `unknown`; `enabled?`: `boolean`; `numTests?`: `number`; `plugins?`: `string`[]; \}; \}; `options?`: \{\[`key`: `string`\]: `any`; `disableConversationVar?`: `boolean`; `disableDefaultAsserts?`: `boolean`; `disableVarExpansion?`: `boolean`; `factuality?`: \{ `agree?`: `number`; `differButFactual?`: `number`; `disagree?`: `number`; `subset?`: `number`; `superset?`: `number`; \}; `postprocess?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `prefix?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `runSerially?`: `boolean`; `storeOutputAs?`: `string`; `suffix?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `transformVars?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `prompts?`: `string`[]; `provider?`: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](../type-aliases/CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: ... \| ...; `description`: `string`; `type?`: ... \| ... \| ... \| ... \| ...; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}; `providerOutput?`: `string` \| `Record`\<`string`, `unknown`\>; `providers?`: `string`[]; `threshold?`: `number`; `vars?`: [`Vars`](../type-aliases/Vars.md); \}

#### derivedMetrics?

> `optional` **derivedMetrics?**: `object`[]

#### description?

> `optional` **description?**: `string`

#### env?

> `optional` **env?**: `object`

##### env.ABLIT_API_BASE_URL?

> `optional` **ABLIT_API_BASE_URL?**: `string`

##### env.ABLIT_KEY?

> `optional` **ABLIT_KEY?**: `string`

##### env.AI21_API_BASE_URL?

> `optional` **AI21_API_BASE_URL?**: `string`

##### env.AI21_API_KEY?

> `optional` **AI21_API_KEY?**: `string`

##### env.AIML_API_KEY?

> `optional` **AIML_API_KEY?**: `string`

##### env.ANTHROPIC_API_KEY?

> `optional` **ANTHROPIC_API_KEY?**: `string`

##### env.ANTHROPIC_BASE_URL?

> `optional` **ANTHROPIC_BASE_URL?**: `string`

##### env.ATLASCLOUD_API_KEY?

> `optional` **ATLASCLOUD_API_KEY?**: `string`

##### env.AWS_BEDROCK_REGION?

> `optional` **AWS_BEDROCK_REGION?**: `string`

##### env.AWS_DEFAULT_REGION?

> `optional` **AWS_DEFAULT_REGION?**: `string`

##### env.AWS_REGION?

> `optional` **AWS_REGION?**: `string`

##### env.AWS_SAGEMAKER_MAX_RETRIES?

> `optional` **AWS_SAGEMAKER_MAX_RETRIES?**: `string`

##### env.AWS_SAGEMAKER_MAX_TOKENS?

> `optional` **AWS_SAGEMAKER_MAX_TOKENS?**: `string`

##### env.AWS_SAGEMAKER_TEMPERATURE?

> `optional` **AWS_SAGEMAKER_TEMPERATURE?**: `string`

##### env.AWS_SAGEMAKER_TOP_P?

> `optional` **AWS_SAGEMAKER_TOP_P?**: `string`

##### env.AZURE_API_BASE_URL?

> `optional` **AZURE_API_BASE_URL?**: `string`

##### env.AZURE_API_HOST?

> `optional` **AZURE_API_HOST?**: `string`

##### env.AZURE_API_KEY?

> `optional` **AZURE_API_KEY?**: `string`

##### env.AZURE_AUTHORITY_HOST?

> `optional` **AZURE_AUTHORITY_HOST?**: `string`

##### env.AZURE_CLIENT_ID?

> `optional` **AZURE_CLIENT_ID?**: `string`

##### env.AZURE_CLIENT_SECRET?

> `optional` **AZURE_CLIENT_SECRET?**: `string`

##### env.AZURE_CONTENT_SAFETY_API_KEY?

> `optional` **AZURE_CONTENT_SAFETY_API_KEY?**: `string`

##### env.AZURE_CONTENT_SAFETY_API_VERSION?

> `optional` **AZURE_CONTENT_SAFETY_API_VERSION?**: `string`

##### env.AZURE_CONTENT_SAFETY_ENDPOINT?

> `optional` **AZURE_CONTENT_SAFETY_ENDPOINT?**: `string`

##### env.AZURE_DEPLOYMENT_NAME?

> `optional` **AZURE_DEPLOYMENT_NAME?**: `string`

##### env.AZURE_EMBEDDING_DEPLOYMENT_NAME?

> `optional` **AZURE_EMBEDDING_DEPLOYMENT_NAME?**: `string`

##### env.AZURE_OPENAI_API_BASE_URL?

> `optional` **AZURE_OPENAI_API_BASE_URL?**: `string`

##### env.AZURE_OPENAI_API_HOST?

> `optional` **AZURE_OPENAI_API_HOST?**: `string`

##### env.AZURE_OPENAI_API_KEY?

> `optional` **AZURE_OPENAI_API_KEY?**: `string`

##### env.AZURE_OPENAI_BASE_URL?

> `optional` **AZURE_OPENAI_BASE_URL?**: `string`

##### env.AZURE_OPENAI_DEPLOYMENT_NAME?

> `optional` **AZURE_OPENAI_DEPLOYMENT_NAME?**: `string`

##### env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?

> `optional` **AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?**: `string`

##### env.AZURE_TENANT_ID?

> `optional` **AZURE_TENANT_ID?**: `string`

##### env.AZURE_TOKEN_SCOPE?

> `optional` **AZURE_TOKEN_SCOPE?**: `string`

##### env.CF_AIG_TOKEN?

> `optional` **CF_AIG_TOKEN?**: `string`

##### env.CLAUDE_CODE_USE_BEDROCK?

> `optional` **CLAUDE_CODE_USE_BEDROCK?**: `string`

##### env.CLAUDE_CODE_USE_VERTEX?

> `optional` **CLAUDE_CODE_USE_VERTEX?**: `string`

##### env.CLAWDBOT_GATEWAY_PASSWORD?

> `optional` **CLAWDBOT_GATEWAY_PASSWORD?**: `string`

##### env.CLAWDBOT_GATEWAY_TOKEN?

> `optional` **CLAWDBOT_GATEWAY_TOKEN?**: `string`

##### env.CLAWDBOT_GATEWAY_URL?

> `optional` **CLAWDBOT_GATEWAY_URL?**: `string`

##### env.CLOUDFLARE_ACCOUNT_ID?

> `optional` **CLOUDFLARE_ACCOUNT_ID?**: `string`

##### env.CLOUDFLARE_API_KEY?

> `optional` **CLOUDFLARE_API_KEY?**: `string`

##### env.CLOUDFLARE_GATEWAY_ID?

> `optional` **CLOUDFLARE_GATEWAY_ID?**: `string`

##### env.CODEX_API_KEY?

> `optional` **CODEX_API_KEY?**: `string`

##### env.COHERE_API_KEY?

> `optional` **COHERE_API_KEY?**: `string`

##### env.COHERE_CLIENT_NAME?

> `optional` **COHERE_CLIENT_NAME?**: `string`

##### env.COMETAPI_KEY?

> `optional` **COMETAPI_KEY?**: `string`

##### env.DATABRICKS_TOKEN?

> `optional` **DATABRICKS_TOKEN?**: `string`

##### env.DATABRICKS_WORKSPACE_URL?

> `optional` **DATABRICKS_WORKSPACE_URL?**: `string`

##### env.DOCKER_MODEL_RUNNER_API_KEY?

> `optional` **DOCKER_MODEL_RUNNER_API_KEY?**: `string`

##### env.DOCKER_MODEL_RUNNER_BASE_URL?

> `optional` **DOCKER_MODEL_RUNNER_BASE_URL?**: `string`

##### env.ELEVENLABS_API_KEY?

> `optional` **ELEVENLABS_API_KEY?**: `string`

##### env.FAL_KEY?

> `optional` **FAL_KEY?**: `string`

##### env.GEMINI_API_KEY?

> `optional` **GEMINI_API_KEY?**: `string`

##### env.GITHUB_TOKEN?

> `optional` **GITHUB_TOKEN?**: `string`

##### env.GOOGLE_API_BASE_URL?

> `optional` **GOOGLE_API_BASE_URL?**: `string`

##### env.GOOGLE_API_HOST?

> `optional` **GOOGLE_API_HOST?**: `string`

##### env.GOOGLE_API_KEY?

> `optional` **GOOGLE_API_KEY?**: `string`

##### env.GOOGLE_GENERATIVE_AI_API_KEY?

> `optional` **GOOGLE_GENERATIVE_AI_API_KEY?**: `string`

##### env.GOOGLE_LOCATION?

> `optional` **GOOGLE_LOCATION?**: `string`

##### env.GOOGLE_PROJECT_ID?

> `optional` **GOOGLE_PROJECT_ID?**: `string`

##### env.GROQ_API_KEY?

> `optional` **GROQ_API_KEY?**: `string`

##### env.HELICONE_API_KEY?

> `optional` **HELICONE_API_KEY?**: `string`

##### env.HF_API_TOKEN?

> `optional` **HF_API_TOKEN?**: `string`

##### env.HF_TOKEN?

> `optional` **HF_TOKEN?**: `string`

##### env.HUGGING_FACE_HUB_TOKEN?

> `optional` **HUGGING_FACE_HUB_TOKEN?**: `string`

##### env.HYPERBOLIC_API_KEY?

> `optional` **HYPERBOLIC_API_KEY?**: `string`

##### env.JFROG_API_KEY?

> `optional` **JFROG_API_KEY?**: `string`

##### env.LANGFUSE_HOST?

> `optional` **LANGFUSE_HOST?**: `string`

##### env.LANGFUSE_PUBLIC_KEY?

> `optional` **LANGFUSE_PUBLIC_KEY?**: `string`

##### env.LANGFUSE_SECRET_KEY?

> `optional` **LANGFUSE_SECRET_KEY?**: `string`

##### env.LITELLM_API_BASE?

> `optional` **LITELLM_API_BASE?**: `string`

##### env.LLAMA_BASE_URL?

> `optional` **LLAMA_BASE_URL?**: `string`

##### env.LOCALAI_BASE_URL?

> `optional` **LOCALAI_BASE_URL?**: `string`

##### env.MISTRAL_API_BASE_URL?

> `optional` **MISTRAL_API_BASE_URL?**: `string`

##### env.MISTRAL_API_HOST?

> `optional` **MISTRAL_API_HOST?**: `string`

##### env.MISTRAL_API_KEY?

> `optional` **MISTRAL_API_KEY?**: `string`

##### env.MODELSLAB_API_KEY?

> `optional` **MODELSLAB_API_KEY?**: `string`

##### env.NSCALE_API_KEY?

> `optional` **NSCALE_API_KEY?**: `string`

##### env.NSCALE_SERVICE_TOKEN?

> `optional` **NSCALE_SERVICE_TOKEN?**: `string`

##### env.OLLAMA_API_KEY?

> `optional` **OLLAMA_API_KEY?**: `string`

##### env.OLLAMA_BASE_URL?

> `optional` **OLLAMA_BASE_URL?**: `string`

##### env.OPENAI_API_BASE_URL?

> `optional` **OPENAI_API_BASE_URL?**: `string`

##### env.OPENAI_API_HOST?

> `optional` **OPENAI_API_HOST?**: `string`

##### env.OPENAI_API_KEY?

> `optional` **OPENAI_API_KEY?**: `string`

##### env.OPENAI_BASE_URL?

> `optional` **OPENAI_BASE_URL?**: `string`

##### env.OPENAI_ORGANIZATION?

> `optional` **OPENAI_ORGANIZATION?**: `string`

##### env.OPENCLAW_CONFIG_PATH?

> `optional` **OPENCLAW_CONFIG_PATH?**: `string`

##### env.OPENCLAW_GATEWAY_PASSWORD?

> `optional` **OPENCLAW_GATEWAY_PASSWORD?**: `string`

##### env.OPENCLAW_GATEWAY_PORT?

> `optional` **OPENCLAW_GATEWAY_PORT?**: `string`

##### env.OPENCLAW_GATEWAY_TOKEN?

> `optional` **OPENCLAW_GATEWAY_TOKEN?**: `string`

##### env.OPENCLAW_GATEWAY_URL?

> `optional` **OPENCLAW_GATEWAY_URL?**: `string`

##### env.PALM_API_HOST?

> `optional` **PALM_API_HOST?**: `string`

##### env.PALM_API_KEY?

> `optional` **PALM_API_KEY?**: `string`

##### env.PORTKEY_API_KEY?

> `optional` **PORTKEY_API_KEY?**: `string`

##### env.PROMPTFOO_CA_CERT_PATH?

> `optional` **PROMPTFOO_CA_CERT_PATH?**: `string`

##### env.PROMPTFOO_EVAL_TIMEOUT_MS?

> `optional` **PROMPTFOO_EVAL_TIMEOUT_MS?**: `string`

##### env.PROMPTFOO_INSECURE_SSL?

> `optional` **PROMPTFOO_INSECURE_SSL?**: `string`

##### env.PROMPTFOO_JKS_ALIAS?

> `optional` **PROMPTFOO_JKS_ALIAS?**: `string`

##### env.PROMPTFOO_JKS_CERT_PATH?

> `optional` **PROMPTFOO_JKS_CERT_PATH?**: `string`

##### env.PROMPTFOO_JKS_PASSWORD?

> `optional` **PROMPTFOO_JKS_PASSWORD?**: `string`

##### env.PROMPTFOO_PFX_CERT_PATH?

> `optional` **PROMPTFOO_PFX_CERT_PATH?**: `string`

##### env.PROMPTFOO_PFX_PASSWORD?

> `optional` **PROMPTFOO_PFX_PASSWORD?**: `string`

##### env.QUIVERAI_API_KEY?

> `optional` **QUIVERAI_API_KEY?**: `string`

##### env.REPLICATE_API_KEY?

> `optional` **REPLICATE_API_KEY?**: `string`

##### env.REPLICATE_API_TOKEN?

> `optional` **REPLICATE_API_TOKEN?**: `string`

##### env.SHAREPOINT_BASE_URL?

> `optional` **SHAREPOINT_BASE_URL?**: `string`

##### env.SHAREPOINT_CERT_PATH?

> `optional` **SHAREPOINT_CERT_PATH?**: `string`

##### env.SHAREPOINT_CLIENT_ID?

> `optional` **SHAREPOINT_CLIENT_ID?**: `string`

##### env.SHAREPOINT_TENANT_ID?

> `optional` **SHAREPOINT_TENANT_ID?**: `string`

##### env.VERCEL_AI_GATEWAY_API_KEY?

> `optional` **VERCEL_AI_GATEWAY_API_KEY?**: `string`

##### env.VERCEL_AI_GATEWAY_BASE_URL?

> `optional` **VERCEL_AI_GATEWAY_BASE_URL?**: `string`

##### env.VERTEX_API_HOST?

> `optional` **VERTEX_API_HOST?**: `string`

##### env.VERTEX_API_KEY?

> `optional` **VERTEX_API_KEY?**: `string`

##### env.VERTEX_API_VERSION?

> `optional` **VERTEX_API_VERSION?**: `string`

##### env.VERTEX_PROJECT_ID?

> `optional` **VERTEX_PROJECT_ID?**: `string`

##### env.VERTEX_PUBLISHER?

> `optional` **VERTEX_PUBLISHER?**: `string`

##### env.VERTEX_REGION?

> `optional` **VERTEX_REGION?**: `string`

##### env.VOYAGE_API_BASE_URL?

> `optional` **VOYAGE_API_BASE_URL?**: `string`

##### env.VOYAGE_API_KEY?

> `optional` **VOYAGE_API_KEY?**: `string`

##### env.WATSONX_AI_APIKEY?

> `optional` **WATSONX_AI_APIKEY?**: `string`

##### env.WATSONX_AI_AUTH_TYPE?

> `optional` **WATSONX_AI_AUTH_TYPE?**: `string`

##### env.WATSONX_AI_BEARER_TOKEN?

> `optional` **WATSONX_AI_BEARER_TOKEN?**: `string`

##### env.WATSONX_AI_PROJECT_ID?

> `optional` **WATSONX_AI_PROJECT_ID?**: `string`

##### env.XAI_API_BASE_URL?

> `optional` **XAI_API_BASE_URL?**: `string`

##### env.XAI_API_KEY?

> `optional` **XAI_API_KEY?**: `string`

#### extensions?

> `optional` **extensions?**: `string`[] \| `null`

#### nunjucksFilters?

> `optional` **nunjucksFilters?**: `Record`\<`string`, (...`args`) => `string`\>

#### prompts

> **prompts**: `object`[]

#### providerPromptMap?

> `optional` **providerPromptMap?**: `Record`\<`string`, `string`[]\>

#### providers

> **providers**: `object`[]

#### redteam?

> `optional` **redteam?**: [`RedteamFileConfig`](RedteamFileConfig.md)

#### scenarios?

> `optional` **scenarios?**: `object`[]

#### tags?

> `optional` **tags?**: `Record`\<`string`, `string`\>

#### tests?

> `optional` **tests?**: `object`[]

#### tracing?

> `optional` **tracing?**: `object`

##### tracing.enabled

> **enabled**: `boolean`

##### tracing.forwarding?

> `optional` **forwarding?**: `object`

##### tracing.forwarding.enabled

> **enabled**: `boolean`

##### tracing.forwarding.endpoint

> **endpoint**: `string`

##### tracing.forwarding.headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

##### tracing.otlp?

> `optional` **otlp?**: `object`

##### tracing.otlp.grpc?

> `optional` **grpc?**: `object`

##### tracing.otlp.grpc.enabled

> **enabled**: `boolean`

##### tracing.otlp.grpc.port

> **port**: `number`

##### tracing.otlp.http?

> `optional` **http?**: `object`

##### tracing.otlp.http.acceptFormats?

> `optional` **acceptFormats?**: (... \| ...)[]

##### tracing.otlp.http.enabled

> **enabled**: `boolean`

##### tracing.otlp.http.host?

> `optional` **host?**: `string`

##### tracing.otlp.http.port

> **port**: `number`

##### tracing.storage?

> `optional` **storage?**: `object`

##### tracing.storage.retentionDays

> **retentionDays**: `number`

##### tracing.storage.type

> **type**: `string`
