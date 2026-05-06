[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AssertionTestContext

# Interface: AssertionTestContext

Defined in: [assertions/index.ts:385](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L385)

Test-case context accepted by low-level assertion APIs.

For the common `runAssertion()` case, `{ vars: {} }` is enough. Use the same
broader shape as an evaluated test case when custom assertions or assertion
handlers need additional context. `runAssertions()` also reads `assert` and
`threshold` from this object.

## Extends

- [`AtomicTestCase`](../type-aliases/AtomicTestCase.md)

## Properties

### assert?

> `optional` **assert?**: (\{ `config?`: `Record`\<`string`, `any`\>; `contextTransform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `metric?`: `string`; `provider?`: `any`; `rubricPrompt?`: `string` \| `string`[] \| `object`[]; `threshold?`: `number`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); `type`: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`; `value?`: `AssertionValue`; `weight?`: `number`; \} \| \{ `assert`: `object`[]; `config?`: `Record`\<`string`, `any`\>; `metric?`: `string`; `threshold?`: `number`; `type`: `"assert-set"`; `weight?`: `number`; \})[]

Defined in: [types/index.ts:963](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L963)

#### Inherited from

`AtomicTestCase.assert`

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| `ScoringFunction`

Defined in: [types/index.ts:966](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L966)

#### Inherited from

`AtomicTestCase.assertScoringFunction`

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:945](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L945)

#### Inherited from

`AtomicTestCase.description`

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/index.ts:1004](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1004)

#### Index Signature

\[`key`: `string`\]: `any`

#### pluginConfig?

> `optional` **pluginConfig?**: `object`

##### pluginConfig.\_\_nonce?

> `optional` **\_\_nonce?**: `number`

##### pluginConfig.examples?

> `optional` **examples?**: `string`[]

##### pluginConfig.excludeStrategies?

> `optional` **excludeStrategies?**: `string`[]

##### pluginConfig.graderExamples?

> `optional` **graderExamples?**: `object`[]

##### pluginConfig.graderGuidance?

> `optional` **graderGuidance?**: `string`

##### pluginConfig.indirectInjectionVar?

> `optional` **indirectInjectionVar?**: `string`

##### pluginConfig.inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: ... \| ... \| ...; `injectionPlacements?`: ... \| ...; `inputPurpose?`: ... \| ...; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

##### pluginConfig.intendedResults?

> `optional` **intendedResults?**: `string`[]

##### pluginConfig.intent?

> `optional` **intent?**: `string` \| (`string` \| `string`[])[]

##### pluginConfig.language?

> `optional` **language?**: `string` \| `string`[]

##### pluginConfig.maxCharsPerMessage?

> `optional` **maxCharsPerMessage?**: `number`

##### pluginConfig.mentions?

> `optional` **mentions?**: `boolean`

##### pluginConfig.modifiers?

> `optional` **modifiers?**: `Record`\<`string`, `unknown`\>

##### pluginConfig.multilingual?

> `optional` **multilingual?**: `boolean`

##### pluginConfig.mustNotExistPath?

> `optional` **mustNotExistPath?**: `string`

##### pluginConfig.mustNotExistPaths?

> `optional` **mustNotExistPaths?**: `string`[]

##### pluginConfig.name?

> `optional` **name?**: `string`

##### pluginConfig.networkAllowedHost?

> `optional` **networkAllowedHost?**: `string`

##### pluginConfig.networkAllowedHosts?

> `optional` **networkAllowedHosts?**: `string`[]

##### pluginConfig.networkAllowedUrl?

> `optional` **networkAllowedUrl?**: `string`

##### pluginConfig.networkAllowedUrls?

> `optional` **networkAllowedUrls?**: `string`[]

##### pluginConfig.networkEgressHost?

> `optional` **networkEgressHost?**: `string`

##### pluginConfig.networkEgressHosts?

> `optional` **networkEgressHosts?**: `string`[]

##### pluginConfig.networkEgressReceipt?

> `optional` **networkEgressReceipt?**: `string`

##### pluginConfig.networkEgressReceipts?

> `optional` **networkEgressReceipts?**: `string`[]

##### pluginConfig.networkEgressUrl?

> `optional` **networkEgressUrl?**: `string`

##### pluginConfig.networkEgressUrls?

> `optional` **networkEgressUrls?**: `string`[]

##### pluginConfig.networkScanPath?

> `optional` **networkScanPath?**: `string`

##### pluginConfig.networkScanPaths?

> `optional` **networkScanPaths?**: `string`[]

##### pluginConfig.networkTrapHost?

> `optional` **networkTrapHost?**: `string`

##### pluginConfig.networkTrapHosts?

> `optional` **networkTrapHosts?**: `string`[]

##### pluginConfig.networkTrapLogPath?

> `optional` **networkTrapLogPath?**: `string`

##### pluginConfig.networkTrapLogPaths?

> `optional` **networkTrapLogPaths?**: `string`[]

##### pluginConfig.networkTrapUrl?

> `optional` **networkTrapUrl?**: `string`

##### pluginConfig.networkTrapUrls?

> `optional` **networkTrapUrls?**: `string`[]

##### pluginConfig.networkWorkspacePath?

> `optional` **networkWorkspacePath?**: `string`

##### pluginConfig.networkWorkspacePaths?

> `optional` **networkWorkspacePaths?**: `string`[]

##### pluginConfig.outsideWriteAllowedPath?

> `optional` **outsideWriteAllowedPath?**: `string`

##### pluginConfig.outsideWriteAllowedPaths?

> `optional` **outsideWriteAllowedPaths?**: `string`[]

##### pluginConfig.outsideWriteExpectedSha256?

> `optional` **outsideWriteExpectedSha256?**: `string`

##### pluginConfig.outsideWriteHostPath?

> `optional` **outsideWriteHostPath?**: `string`

##### pluginConfig.outsideWriteHostPaths?

> `optional` **outsideWriteHostPaths?**: `string`[]

##### pluginConfig.outsideWriteMustNotExistPath?

> `optional` **outsideWriteMustNotExistPath?**: `string`

##### pluginConfig.outsideWriteMustNotExistPaths?

> `optional` **outsideWriteMustNotExistPaths?**: `string`[]

##### pluginConfig.outsideWritePath?

> `optional` **outsideWritePath?**: `string`

##### pluginConfig.outsideWritePaths?

> `optional` **outsideWritePaths?**: `string`[]

##### pluginConfig.outsideWritePathSha256?

> `optional` **outsideWritePathSha256?**: `string`

##### pluginConfig.outsideWriteProbeDir?

> `optional` **outsideWriteProbeDir?**: `string`

##### pluginConfig.outsideWriteProbeDirs?

> `optional` **outsideWriteProbeDirs?**: `string`[]

##### pluginConfig.outsideWriteSha256?

> `optional` **outsideWriteSha256?**: `string`

##### pluginConfig.policy?

> `optional` **policy?**: `string` \| \{ `id`: `string`; `name?`: `string`; `text?`: `string`; \}

##### pluginConfig.prompt?

> `optional` **prompt?**: `string`

##### pluginConfig.protectedFilePath?

> `optional` **protectedFilePath?**: `string`

##### pluginConfig.protectedFilePaths?

> `optional` **protectedFilePaths?**: `string`[]

##### pluginConfig.protectedWritePath?

> `optional` **protectedWritePath?**: `string`

##### pluginConfig.protectedWritePaths?

> `optional` **protectedWritePaths?**: `string`[]

##### pluginConfig.purpose?

> `optional` **purpose?**: `string`

##### pluginConfig.sandboxWritePath?

> `optional` **sandboxWritePath?**: `string`

##### pluginConfig.sandboxWritePaths?

> `optional` **sandboxWritePaths?**: `string`[]

##### pluginConfig.secretFilePath?

> `optional` **secretFilePath?**: `string`

##### pluginConfig.secretFilePaths?

> `optional` **secretFilePaths?**: `string`[]

##### pluginConfig.secretFileValue?

> `optional` **secretFileValue?**: `string`

##### pluginConfig.secretFileValues?

> `optional` **secretFileValues?**: `string`[]

##### pluginConfig.secretLocalFilePath?

> `optional` **secretLocalFilePath?**: `string`

##### pluginConfig.secretLocalFilePaths?

> `optional` **secretLocalFilePaths?**: `string`[]

##### pluginConfig.severity?

> `optional` **severity?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"` \| `"informational"`

##### pluginConfig.ssrfFailThreshold?

> `optional` **ssrfFailThreshold?**: `"critical"` \| `"high"` \| `"medium"` \| `"low"`

##### pluginConfig.systemPrompt?

> `optional` **systemPrompt?**: `string`

##### pluginConfig.targetIdentifiers?

> `optional` **targetIdentifiers?**: `string`[]

##### pluginConfig.targetSystems?

> `optional` **targetSystems?**: `string`[]

##### pluginConfig.targetUrls?

> `optional` **targetUrls?**: `string`[]

##### pluginConfig.verifierArtifactRoot?

> `optional` **verifierArtifactRoot?**: `string`

##### pluginConfig.verifierArtifactRoots?

> `optional` **verifierArtifactRoots?**: `string`[]

##### pluginConfig.verifierProbeDir?

> `optional` **verifierProbeDir?**: `string`

##### pluginConfig.verifierProbeDirs?

> `optional` **verifierProbeDirs?**: `string`[]

##### pluginConfig.workingDir?

> `optional` **workingDir?**: `string`

##### pluginConfig.workingDirectory?

> `optional` **workingDirectory?**: `string`

##### pluginConfig.workingDirectoryPath?

> `optional` **workingDirectoryPath?**: `string`

##### pluginConfig.workspacePath?

> `optional` **workspacePath?**: `string`

##### pluginConfig.workspacePaths?

> `optional` **workspacePaths?**: `string`[]

##### pluginConfig.workspaceRoot?

> `optional` **workspaceRoot?**: `string`

##### pluginConfig.workspaceRoots?

> `optional` **workspaceRoots?**: `string`[]

#### strategyConfig?

> `optional` **strategyConfig?**: `object`

##### Index Signature

\[`key`: `string`\]: `unknown`

##### strategyConfig.enabled?

> `optional` **enabled?**: `boolean`

##### strategyConfig.numTests?

> `optional` **numTests?**: `number`

##### strategyConfig.plugins?

> `optional` **plugins?**: `string`[]

#### Inherited from

`AtomicTestCase.metadata`

---

### options?

> `optional` **options?**: `object`

Defined in: [types/index.ts:981](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L981)

#### Index Signature

\[`key`: `string`\]: `any`

#### disableConversationVar?

> `optional` **disableConversationVar?**: `boolean`

#### disableDefaultAsserts?

> `optional` **disableDefaultAsserts?**: `boolean`

#### disableVarExpansion?

> `optional` **disableVarExpansion?**: `boolean`

#### factuality?

> `optional` **factuality?**: `object`

##### factuality.agree?

> `optional` **agree?**: `number`

##### factuality.differButFactual?

> `optional` **differButFactual?**: `number`

##### factuality.disagree?

> `optional` **disagree?**: `number`

##### factuality.subset?

> `optional` **subset?**: `number`

##### factuality.superset?

> `optional` **superset?**: `number`

#### ~~postprocess?~~

> `optional` **postprocess?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

##### Deprecated

in > 0.38.0. Use `transform` instead.

#### prefix?

> `optional` **prefix?**: `string`

#### provider?

> `optional` **provider?**: `any`

#### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

#### runSerially?

> `optional` **runSerially?**: `boolean`

#### storeOutputAs?

> `optional` **storeOutputAs?**: `string`

#### suffix?

> `optional` **suffix?**: `string`

#### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

#### transformVars?

> `optional` **transformVars?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

#### Inherited from

`AtomicTestCase.options`

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:957](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L957)

#### Inherited from

`AtomicTestCase.prompts`

---

### provider?

> `optional` **provider?**: `string` \| \{ `config?`: `any`; `delay?`: `number`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \}; `id?`: `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `prompts?`: `string`[]; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \} \| \{ `callApi`: [`CallApiFunction`](CallApiFunction.md); `callClassificationApi?`: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>; `callEmbeddingApi?`: (`prompt`) => `Promise`\<`ProviderEmbeddingResponse`\>; `config?`: `any`; `delay?`: `number`; `id`: () => `string`; `inputs?`: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>; `label?`: `string`; `transform?`: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md); \}

Defined in: [types/index.ts:951](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L951)

#### Inherited from

`AtomicTestCase.provider`

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:960](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L960)

#### Inherited from

`AtomicTestCase.providerOutput`

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:954](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L954)

#### Inherited from

`AtomicTestCase.providers`

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:999](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L999)

#### Inherited from

`AtomicTestCase.threshold`

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1049](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1049)

#### Inherited from

`AtomicTestCase.vars`
