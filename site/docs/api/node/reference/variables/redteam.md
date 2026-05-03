[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / redteam

# Variable: redteam

> `const` **redteam**: `object`

Defined in: [index.ts:427](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L427)

**`Beta`**

Advanced red team helpers exposed through the Node.js package.

This surface is still evolving; prefer the CLI and documented red team config
flows unless you specifically need programmatic orchestration.

## Type Declaration

### Base

> **Base**: `object`

#### Base.Grader

> **Grader**: _typeof_ `RedteamGraderBase` = `RedteamGraderBase`

#### Base.Plugin

> **Plugin**: _typeof_ `RedteamPluginBase` = `RedteamPluginBase`

### Extractors

> **Extractors**: `object`

#### Extractors.extractEntities

> **extractEntities**: (`provider`, `prompts`) => `Promise`\<`string`[]\>

##### Parameters

###### provider

[`ApiProvider`](../interfaces/ApiProvider.md)

###### prompts

`string`[]

##### Returns

`Promise`\<`string`[]\>

#### Extractors.extractMcpToolsInfo

> **extractMcpToolsInfo**: (`providers`) => `Promise`\<`string`\>

Extract tools information from MCP providers and format for red team purpose

##### Parameters

###### providers

[`ApiProvider`](../interfaces/ApiProvider.md)[]

##### Returns

`Promise`\<`string`\>

#### Extractors.extractSystemPurpose

> **extractSystemPurpose**: (`provider`, `prompts`) => `Promise`\<`string`\>

##### Parameters

###### provider

[`ApiProvider`](../interfaces/ApiProvider.md)

###### prompts

`string`[]

##### Returns

`Promise`\<`string`\>

### generate

> **generate**: (`options`) => `Promise`\<`Partial`\<\{ `commandLineOptions?`: \{ `assertions?`: `string`; `cache?`: `boolean`; `config?`: `string`[]; `delay?`: `number`; `description?`: `string`; `envPath?`: `string` \| `string`[]; `extension?`: `string`[]; `filterErrorsOnly?`: `string`; `filterFailing?`: `string`; `filterFailingOnly?`: `string`; `filterFirstN?`: `number`; `filterMetadata?`: `string` \| `string`[]; `filterPattern?`: `string`; `filterPrompts?`: `string`; `filterProviders?`: `string`; `filterRange?`: `string`; `filterSample?`: `number`; `filterTargets?`: `string`; `generateSuggestions?`: `boolean`; `grader?`: `string`; `maxConcurrency?`: `number`; `modelOutputs?`: `string`; `noShare?`: `boolean`; `output?`: `string`[]; `progressBar?`: `boolean`; `promptPrefix?`: `string`; `prompts?`: `string`[]; `promptSuffix?`: `string`; `providers?`: `string`[]; `repeat?`: `number`; `retryErrors?`: `boolean`; `share?`: `boolean`; `table?`: `boolean`; `tableCellMaxLength?`: `number`; `tests?`: `string`; `var?`: `Record`\<`string`, `string`\>; `vars?`: `string`; `verbose?`: `boolean`; `watch?`: `boolean`; `write?`: `boolean`; \}; `defaultTest?`: `string` \| \{ `assert?`: (... \| ...)[]; `assertScoringFunction?`: `string` \| `ScoringFunction`; `metadata?`: \{\[`key`: `string`\]: `any`; `pluginConfig?`: ... \| ...; `strategyConfig?`: ... \| ...; \}; `options?`: \{\[`key`: `string`\]: `any`; `disableConversationVar?`: ... \| ... \| ...; `disableDefaultAsserts?`: ... \| ... \| ...; `disableVarExpansion?`: ... \| ... \| ...; `factuality?`: ... \| ...; `postprocess?`: ... \| ... \| ...; `prefix?`: ... \| ...; `provider?`: `any`; `rubricPrompt?`: ... \| ... \| ... \| ...; `runSerially?`: ... \| ... \| ...; `storeOutputAs?`: ... \| ...; `suffix?`: ... \| ...; `transform?`: ... \| ... \| ...; `transformVars?`: ... \| ... \| ...; \}; `prompts?`: `string`[]; `provider?`: `string` \| \{ `config?`: `any`; `delay?`: ... \| ...; `env?`: ... \| ...; `id?`: ... \| ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `prompts?`: ... \| ...; `transform?`: ... \| ... \| ...; \} \| \{ `callApi`: [`CallApiFunction`](../interfaces/CallApiFunction.md); `callClassificationApi?`: ... \| ...; `callEmbeddingApi?`: ... \| ...; `config?`: `any`; `delay?`: ... \| ...; `id`: () => ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `transform?`: ... \| ... \| ...; \}; `providerOutput?`: `string` \| `Record`\<`string`, `unknown`\>; `providers?`: `string`[]; `threshold?`: `number`; `vars?`: `Vars`; \}; `derivedMetrics?`: `object`[]; `description?`: `string`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \} \| `Record`\<`string`, `string`\>; `evaluateOptions?`: \{ `cache?`: `boolean`; `delay?`: `number`; `eventSource?`: `string`; `filterRange?`: `string`; `generateSuggestions?`: `boolean`; `interactiveProviders?`: `boolean`; `isRedteam?`: `boolean`; `maxConcurrency?`: `number`; `maxEvalTimeMs?`: `number`; `progressCallback?`: (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`; `repeat?`: `number`; `showProgressBar?`: `boolean`; `silent?`: `boolean`; `timeoutMs?`: `number`; \}; `extensions?`: `string`[] \| `null`; `metadata?`: `Record`\<`string`, `any`\>; `nunjucksFilters?`: `Record`\<`string`, `string`\>; `outputPath?`: `string` \| `string`[]; `prompts`: `string` \| `Record`\<`string`, `string`\> \| (`string` \| \{ `config?`: `any`; `display?`: ... \| ...; `function?`: ... \| ...; `id?`: ... \| ...; `label`: `string`; `raw`: `string`; `template?`: ... \| ...; \} \| \{ `id`: `string`; `label?`: ... \| ...; `raw?`: ... \| ...; \})[]; `providers?`: `string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| (`string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| \{ `config?`: `any`; `delay?`: ... \| ...; `env?`: ... \| ...; `id?`: ... \| ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `prompts?`: ... \| ...; `transform?`: ... \| ... \| ...; \} \| `Record`\<`string`, \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \}\>)[]; `redteam?`: `RedteamFileConfig`; `scenarios?`: (`string` \| \{ `config`: ...[]; `description?`: ... \| ...; `tests`: ...[]; \})[]; `sharing?`: `boolean` \| \{ `apiBaseUrl?`: `string`; `appBaseUrl?`: `string`; \}; `tags?`: `Record`\<`string`, `string`\>; `targets?`: `string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| (`string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| \{ `config?`: `any`; `delay?`: ... \| ...; `env?`: ... \| ...; `id?`: ... \| ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `prompts?`: ... \| ...; `transform?`: ... \| ... \| ...; \} \| `Record`\<`string`, \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \}\>)[]; `tests?`: `string` \| \{ `config?`: `Record`\<`string`, `any`\>; `path`: `string`; \} \| (`string` \| \{ `assert?`: ... \| ...; `assertScoringFunction?`: ... \| ... \| ...; `description?`: ... \| ...; `metadata?`: ... \| ...; `options?`: ... \| ...; `prompts?`: ... \| ...; `provider?`: ... \| ... \| ... \| ...; `providerOutput?`: ... \| ... \| ...; `providers?`: ... \| ...; `threshold?`: ... \| ...; `vars?`: ... \| ...; \} \| \{ `config?`: ... \| ...; `path`: `string`; \})[]; `tracing?`: \{ `enabled`: `boolean`; `forwarding?`: \{ `enabled`: `boolean`; `endpoint`: `string`; `headers?`: ... \| ...; \}; `otlp?`: \{ `grpc?`: ... \| ...; `http?`: ... \| ...; \}; `storage?`: \{ `retentionDays`: `number`; `type`: `"sqlite"`; \}; \}; `writeLatestResults?`: `boolean`; \}\> \| `null`\> = `doGenerateRedteam`

#### Parameters

##### options

`Partial`\<`RedteamCliGenerateOptions`\>

#### Returns

`Promise`\<`Partial`\<\{ `commandLineOptions?`: \{ `assertions?`: `string`; `cache?`: `boolean`; `config?`: `string`[]; `delay?`: `number`; `description?`: `string`; `envPath?`: `string` \| `string`[]; `extension?`: `string`[]; `filterErrorsOnly?`: `string`; `filterFailing?`: `string`; `filterFailingOnly?`: `string`; `filterFirstN?`: `number`; `filterMetadata?`: `string` \| `string`[]; `filterPattern?`: `string`; `filterPrompts?`: `string`; `filterProviders?`: `string`; `filterRange?`: `string`; `filterSample?`: `number`; `filterTargets?`: `string`; `generateSuggestions?`: `boolean`; `grader?`: `string`; `maxConcurrency?`: `number`; `modelOutputs?`: `string`; `noShare?`: `boolean`; `output?`: `string`[]; `progressBar?`: `boolean`; `promptPrefix?`: `string`; `prompts?`: `string`[]; `promptSuffix?`: `string`; `providers?`: `string`[]; `repeat?`: `number`; `retryErrors?`: `boolean`; `share?`: `boolean`; `table?`: `boolean`; `tableCellMaxLength?`: `number`; `tests?`: `string`; `var?`: `Record`\<`string`, `string`\>; `vars?`: `string`; `verbose?`: `boolean`; `watch?`: `boolean`; `write?`: `boolean`; \}; `defaultTest?`: `string` \| \{ `assert?`: (... \| ...)[]; `assertScoringFunction?`: `string` \| `ScoringFunction`; `metadata?`: \{\[`key`: `string`\]: `any`; `pluginConfig?`: ... \| ...; `strategyConfig?`: ... \| ...; \}; `options?`: \{\[`key`: `string`\]: `any`; `disableConversationVar?`: ... \| ... \| ...; `disableDefaultAsserts?`: ... \| ... \| ...; `disableVarExpansion?`: ... \| ... \| ...; `factuality?`: ... \| ...; `postprocess?`: ... \| ... \| ...; `prefix?`: ... \| ...; `provider?`: `any`; `rubricPrompt?`: ... \| ... \| ... \| ...; `runSerially?`: ... \| ... \| ...; `storeOutputAs?`: ... \| ...; `suffix?`: ... \| ...; `transform?`: ... \| ... \| ...; `transformVars?`: ... \| ... \| ...; \}; `prompts?`: `string`[]; `provider?`: `string` \| \{ `config?`: `any`; `delay?`: ... \| ...; `env?`: ... \| ...; `id?`: ... \| ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `prompts?`: ... \| ...; `transform?`: ... \| ... \| ...; \} \| \{ `callApi`: [`CallApiFunction`](../interfaces/CallApiFunction.md); `callClassificationApi?`: ... \| ...; `callEmbeddingApi?`: ... \| ...; `config?`: `any`; `delay?`: ... \| ...; `id`: () => ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `transform?`: ... \| ... \| ...; \}; `providerOutput?`: `string` \| `Record`\<`string`, `unknown`\>; `providers?`: `string`[]; `threshold?`: `number`; `vars?`: `Vars`; \}; `derivedMetrics?`: `object`[]; `description?`: `string`; `env?`: \{ `ABLIT_API_BASE_URL?`: `string`; `ABLIT_KEY?`: `string`; `AI21_API_BASE_URL?`: `string`; `AI21_API_KEY?`: `string`; `AIML_API_KEY?`: `string`; `ANTHROPIC_API_KEY?`: `string`; `ANTHROPIC_BASE_URL?`: `string`; `ATLASCLOUD_API_KEY?`: `string`; `AWS_BEDROCK_REGION?`: `string`; `AWS_DEFAULT_REGION?`: `string`; `AWS_REGION?`: `string`; `AWS_SAGEMAKER_MAX_RETRIES?`: `string`; `AWS_SAGEMAKER_MAX_TOKENS?`: `string`; `AWS_SAGEMAKER_TEMPERATURE?`: `string`; `AWS_SAGEMAKER_TOP_P?`: `string`; `AZURE_API_BASE_URL?`: `string`; `AZURE_API_HOST?`: `string`; `AZURE_API_KEY?`: `string`; `AZURE_AUTHORITY_HOST?`: `string`; `AZURE_CLIENT_ID?`: `string`; `AZURE_CLIENT_SECRET?`: `string`; `AZURE_CONTENT_SAFETY_API_KEY?`: `string`; `AZURE_CONTENT_SAFETY_API_VERSION?`: `string`; `AZURE_CONTENT_SAFETY_ENDPOINT?`: `string`; `AZURE_DEPLOYMENT_NAME?`: `string`; `AZURE_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_API_BASE_URL?`: `string`; `AZURE_OPENAI_API_HOST?`: `string`; `AZURE_OPENAI_API_KEY?`: `string`; `AZURE_OPENAI_BASE_URL?`: `string`; `AZURE_OPENAI_DEPLOYMENT_NAME?`: `string`; `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?`: `string`; `AZURE_TENANT_ID?`: `string`; `AZURE_TOKEN_SCOPE?`: `string`; `CF_AIG_TOKEN?`: `string`; `CLAUDE_CODE_USE_BEDROCK?`: `string`; `CLAUDE_CODE_USE_VERTEX?`: `string`; `CLAWDBOT_GATEWAY_PASSWORD?`: `string`; `CLAWDBOT_GATEWAY_TOKEN?`: `string`; `CLAWDBOT_GATEWAY_URL?`: `string`; `CLOUDFLARE_ACCOUNT_ID?`: `string`; `CLOUDFLARE_API_KEY?`: `string`; `CLOUDFLARE_GATEWAY_ID?`: `string`; `CODEX_API_KEY?`: `string`; `COHERE_API_KEY?`: `string`; `COHERE_CLIENT_NAME?`: `string`; `COMETAPI_KEY?`: `string`; `DATABRICKS_TOKEN?`: `string`; `DATABRICKS_WORKSPACE_URL?`: `string`; `DOCKER_MODEL_RUNNER_API_KEY?`: `string`; `DOCKER_MODEL_RUNNER_BASE_URL?`: `string`; `ELEVENLABS_API_KEY?`: `string`; `FAL_KEY?`: `string`; `GEMINI_API_KEY?`: `string`; `GITHUB_TOKEN?`: `string`; `GOOGLE_API_BASE_URL?`: `string`; `GOOGLE_API_HOST?`: `string`; `GOOGLE_API_KEY?`: `string`; `GOOGLE_GENERATIVE_AI_API_KEY?`: `string`; `GOOGLE_LOCATION?`: `string`; `GOOGLE_PROJECT_ID?`: `string`; `GROQ_API_KEY?`: `string`; `HELICONE_API_KEY?`: `string`; `HF_API_TOKEN?`: `string`; `HF_TOKEN?`: `string`; `HUGGING_FACE_HUB_TOKEN?`: `string`; `HYPERBOLIC_API_KEY?`: `string`; `JFROG_API_KEY?`: `string`; `LANGFUSE_HOST?`: `string`; `LANGFUSE_PUBLIC_KEY?`: `string`; `LANGFUSE_SECRET_KEY?`: `string`; `LITELLM_API_BASE?`: `string`; `LLAMA_BASE_URL?`: `string`; `LOCALAI_BASE_URL?`: `string`; `MISTRAL_API_BASE_URL?`: `string`; `MISTRAL_API_HOST?`: `string`; `MISTRAL_API_KEY?`: `string`; `MODELSLAB_API_KEY?`: `string`; `NSCALE_API_KEY?`: `string`; `NSCALE_SERVICE_TOKEN?`: `string`; `OLLAMA_API_KEY?`: `string`; `OLLAMA_BASE_URL?`: `string`; `OPENAI_API_BASE_URL?`: `string`; `OPENAI_API_HOST?`: `string`; `OPENAI_API_KEY?`: `string`; `OPENAI_BASE_URL?`: `string`; `OPENAI_ORGANIZATION?`: `string`; `OPENCLAW_CONFIG_PATH?`: `string`; `OPENCLAW_GATEWAY_PASSWORD?`: `string`; `OPENCLAW_GATEWAY_PORT?`: `string`; `OPENCLAW_GATEWAY_TOKEN?`: `string`; `OPENCLAW_GATEWAY_URL?`: `string`; `PALM_API_HOST?`: `string`; `PALM_API_KEY?`: `string`; `PORTKEY_API_KEY?`: `string`; `PROMPTFOO_CA_CERT_PATH?`: `string`; `PROMPTFOO_EVAL_TIMEOUT_MS?`: `string`; `PROMPTFOO_INSECURE_SSL?`: `string`; `PROMPTFOO_JKS_ALIAS?`: `string`; `PROMPTFOO_JKS_CERT_PATH?`: `string`; `PROMPTFOO_JKS_PASSWORD?`: `string`; `PROMPTFOO_PFX_CERT_PATH?`: `string`; `PROMPTFOO_PFX_PASSWORD?`: `string`; `QUIVERAI_API_KEY?`: `string`; `REPLICATE_API_KEY?`: `string`; `REPLICATE_API_TOKEN?`: `string`; `SHAREPOINT_BASE_URL?`: `string`; `SHAREPOINT_CERT_PATH?`: `string`; `SHAREPOINT_CLIENT_ID?`: `string`; `SHAREPOINT_TENANT_ID?`: `string`; `VERCEL_AI_GATEWAY_API_KEY?`: `string`; `VERCEL_AI_GATEWAY_BASE_URL?`: `string`; `VERTEX_API_HOST?`: `string`; `VERTEX_API_KEY?`: `string`; `VERTEX_API_VERSION?`: `string`; `VERTEX_PROJECT_ID?`: `string`; `VERTEX_PUBLISHER?`: `string`; `VERTEX_REGION?`: `string`; `VOYAGE_API_BASE_URL?`: `string`; `VOYAGE_API_KEY?`: `string`; `WATSONX_AI_APIKEY?`: `string`; `WATSONX_AI_AUTH_TYPE?`: `string`; `WATSONX_AI_BEARER_TOKEN?`: `string`; `WATSONX_AI_PROJECT_ID?`: `string`; `XAI_API_BASE_URL?`: `string`; `XAI_API_KEY?`: `string`; \} \| `Record`\<`string`, `string`\>; `evaluateOptions?`: \{ `cache?`: `boolean`; `delay?`: `number`; `eventSource?`: `string`; `filterRange?`: `string`; `generateSuggestions?`: `boolean`; `interactiveProviders?`: `boolean`; `isRedteam?`: `boolean`; `maxConcurrency?`: `number`; `maxEvalTimeMs?`: `number`; `progressCallback?`: (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`; `repeat?`: `number`; `showProgressBar?`: `boolean`; `silent?`: `boolean`; `timeoutMs?`: `number`; \}; `extensions?`: `string`[] \| `null`; `metadata?`: `Record`\<`string`, `any`\>; `nunjucksFilters?`: `Record`\<`string`, `string`\>; `outputPath?`: `string` \| `string`[]; `prompts`: `string` \| `Record`\<`string`, `string`\> \| (`string` \| \{ `config?`: `any`; `display?`: ... \| ...; `function?`: ... \| ...; `id?`: ... \| ...; `label`: `string`; `raw`: `string`; `template?`: ... \| ...; \} \| \{ `id`: `string`; `label?`: ... \| ...; `raw?`: ... \| ...; \})[]; `providers?`: `string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| (`string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| \{ `config?`: `any`; `delay?`: ... \| ...; `env?`: ... \| ...; `id?`: ... \| ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `prompts?`: ... \| ...; `transform?`: ... \| ... \| ...; \} \| `Record`\<`string`, \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \}\>)[]; `redteam?`: `RedteamFileConfig`; `scenarios?`: (`string` \| \{ `config`: ...[]; `description?`: ... \| ...; `tests`: ...[]; \})[]; `sharing?`: `boolean` \| \{ `apiBaseUrl?`: `string`; `appBaseUrl?`: `string`; \}; `tags?`: `Record`\<`string`, `string`\>; `targets?`: `string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| (`string` \| [`CallApiFunction`](../interfaces/CallApiFunction.md) & `object` \| \{ `config?`: `any`; `delay?`: ... \| ...; `env?`: ... \| ...; `id?`: ... \| ...; `inputs?`: ... \| ...; `label?`: ... \| ...; `prompts?`: ... \| ...; `transform?`: ... \| ... \| ...; \} \| `Record`\<`string`, \{ `config?`: ...; `delay?`: ...; `env?`: ...; `id?`: ...; `inputs?`: ...; `label?`: ...; `prompts?`: ...; `transform?`: ...; \}\>)[]; `tests?`: `string` \| \{ `config?`: `Record`\<`string`, `any`\>; `path`: `string`; \} \| (`string` \| \{ `assert?`: ... \| ...; `assertScoringFunction?`: ... \| ... \| ...; `description?`: ... \| ...; `metadata?`: ... \| ...; `options?`: ... \| ...; `prompts?`: ... \| ...; `provider?`: ... \| ... \| ... \| ...; `providerOutput?`: ... \| ... \| ...; `providers?`: ... \| ...; `threshold?`: ... \| ...; `vars?`: ... \| ...; \} \| \{ `config?`: ... \| ...; `path`: `string`; \})[]; `tracing?`: \{ `enabled`: `boolean`; `forwarding?`: \{ `enabled`: `boolean`; `endpoint`: `string`; `headers?`: ... \| ...; \}; `otlp?`: \{ `grpc?`: ... \| ...; `http?`: ... \| ...; \}; `storage?`: \{ `retentionDays`: `number`; `type`: `"sqlite"`; \}; \}; `writeLatestResults?`: `boolean`; \}\> \| `null`\>

### Graders

> **Graders**: `Record`\<`` `promptfoo:redteam:${string}` ``, `RedteamGraderBase`\> = `GRADERS`

### Plugins

> **Plugins**: `PluginFactory`[]

### run

> **run**: (`options`) => `Promise`\<`Eval` \| `undefined`\> = `doRedteamRun`

#### Parameters

##### options

`RedteamRunOptions`

#### Returns

`Promise`\<`Eval` \| `undefined`\>

### Strategies

> **Strategies**: `Strategy`[]
