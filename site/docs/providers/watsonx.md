---
sidebar_label: WatsonX
description: Configure IBM WatsonX's Granite and Llama models for enterprise-grade LLM testing, with specialized support for code generation, vision, and multilingual tasks
---

# WatsonX

[IBM WatsonX](https://www.ibm.com/watsonx) offers a range of enterprise-grade foundation models optimized for various business use cases. This provider supports several powerful models from the `Granite` and `Llama` series, along with additional models for code generation, multilingual tasks, vision processing, and more.

## Supported Models

IBM watsonx.ai provides foundation models through their inference API. The promptfoo WatsonX provider currently supports **text generation and chat models** that can be called directly via API.

:::tip Finding Available Models

To see the latest models available in your region, use IBM's API:

```bash
curl "https://us-south.ml.cloud.ibm.com/ml/v1/foundation_model_specs?version=2024-05-01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

:::

### Currently Available Models

The following models are available for text generation and chat:

#### IBM Granite

- `ibm/granite-4-h-small` - Latest 32B parameter model
- `ibm/granite-3-3-8b-instruct` - **Recommended** latest 8B instruct model
- `ibm/granite-3-8b-instruct` - Standard 8B instruct model
- `ibm/granite-3-2-8b-instruct` - Reasoning-capable 8B model
- `ibm/granite-3-2b-instruct` - Lightweight 2B model (deprecated - use 3-3-8b)
- `ibm/granite-13b-instruct-v2` - 13B model (deprecated - use 3-3-8b)
- `ibm/granite-guardian-3-8b` - Safety/guardrail model
- `ibm/granite-guardian-3-2b` - Smaller guardrail model (deprecated)
- `ibm/granite-8b-code-instruct` - Code generation specialist
- `ibm/granite-vision-3-2-2b` - Vision model (deprecated)

#### Meta Llama

- `meta-llama/llama-4-maverick-17b-128e-instruct-fp8` - Latest Llama 4 model
- `meta-llama/llama-3-3-70b-instruct` - Latest Llama 3.3 (70B)
- `meta-llama/llama-3-405b-instruct` - Flagship 405B model
- `meta-llama/llama-3-2-11b-vision-instruct` - Vision model (11B)
- `meta-llama/llama-3-2-90b-vision-instruct` - Vision model (90B)
- `meta-llama/llama-guard-3-11b-vision` - Safety model for vision
- `meta-llama/llama-2-13b-chat` - Legacy Llama 2 model

#### Mistral

- `mistralai/mistral-large` - Flagship Mistral model
- `mistralai/mistral-medium-2505` - Mid-tier model (2025-05 version)
- `mistralai/mistral-small-3-1-24b-instruct-2503` - Smaller instruct model
- `mistralai/pixtral-12b` - Vision model (12B)

#### Other Models

- `google/flan-t5-xl` - Google's T5 model (deprecated)
- `openai/gpt-oss-120b` - Open-source GPT-compatible model

### Other Model Types

IBM watsonx.ai also offers:

- **Deploy on Demand Models** - Curated models with `-curated` suffix that require creating a dedicated deployment first
- **Embedding Models** - For generating text embeddings (e.g., `ibm/granite-embedding-278m-multilingual`)
- **Reranker Models** - For improving search results (e.g., `cross-encoder/ms-marco-minilm-l-12-v2`)

:::info Additional Model Types Not Currently Supported

The promptfoo WatsonX provider focuses on **text generation and chat models only**. Deploy on Demand, embedding, and reranker models use different API endpoints and workflows. For these model types, use IBM's API directly or create a [custom provider](/docs/providers/custom-api/).

:::

:::note Model Availability

- **Region-specific**: Model availability varies by IBM Cloud region
- **Version changes**: IBM regularly updates available models
- **Deprecation**: Models marked "deprecated" will be removed in future releases

Always verify current availability using IBM's API or check your watsonx.ai project's model catalog.

:::

## Prerequisites

Before integrating the WatsonX provider, ensure you have the following:

1. **IBM Cloud Account**: You will need an IBM Cloud account to obtain API access to WatsonX models.

2. **API Key or Bearer Token, and Project ID**:
   - **API Key**: You can retrieve your API key by logging in to your [IBM Cloud Account](https://cloud.ibm.com) and navigating to the "API Keys" section.
   - **Bearer Token**: To obtain a bearer token, follow [this guide](https://cloud.ibm.com/docs/account?topic=account-iamtoken_from_apikey).
   - **Project ID**: To find your Project ID, log in to IBM WatsonX Prompt Lab, select your project, and locate the project ID in the provided `curl` command.

Make sure you have either the API key or bearer token, along with the project ID, before proceeding.

## Installation

To install the WatsonX provider, use the following steps:

1. Install the necessary dependencies:

   ```sh
   npm install @ibm-cloud/watsonx-ai ibm-cloud-sdk-core
   ```

2. Set up the necessary environment variables:

   You can choose between two authentication methods:

   **Option 1: IAM Authentication (Recommended)**

   ```sh
   export WATSONX_AI_APIKEY=your-ibm-cloud-api-key
   export WATSONX_AI_PROJECT_ID=your-project-id
   ```

   **Option 2: Bearer Token Authentication**

   ```sh
   export WATSONX_AI_BEARER_TOKEN=your-bearer-token
   export WATSONX_AI_PROJECT_ID=your-project-id
   ```

   **Force Specific Auth Method (Optional)**

   ```sh
   export WATSONX_AI_AUTH_TYPE=iam  # or 'bearertoken'
   ```

   :::note Authentication Priority

   If `WATSONX_AI_AUTH_TYPE` is not set, the provider will automatically use:
   1. IAM authentication if `WATSONX_AI_APIKEY` is available
   2. Bearer token authentication if `WATSONX_AI_BEARER_TOKEN` is available

   :::

3. Alternatively, you can configure the authentication and project ID directly in the configuration file:

   ```yaml
   providers:
     - id: watsonx:ibm/granite-3-3-8b-instruct
       config:
         # Option 1: IAM Authentication
         apiKey: your-ibm-cloud-api-key

         # Option 2: Bearer Token Authentication
         # apiBearerToken: your-ibm-cloud-bearer-token

         projectId: your-ibm-project-id
         serviceUrl: https://us-south.ml.cloud.ibm.com
   ```

### Usage Examples

Once configured, you can use the WatsonX provider to generate text responses based on prompts. Here's an example using the **Granite 3.3 8B Instruct** model:

```yaml
providers:
  - watsonx:ibm/granite-3-3-8b-instruct

prompts:
  - "Answer the following question: '{{question}}'"

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

You can also use other models by changing the model ID:

```yaml
providers:
  # IBM Granite models
  - watsonx:ibm/granite-4-h-small
  - watsonx:ibm/granite-3-8b-instruct

  # Meta Llama models
  - watsonx:meta-llama/llama-3-3-70b-instruct
  - watsonx:meta-llama/llama-3-405b-instruct

  # Mistral models
  - watsonx:mistralai/mistral-large
  - watsonx:mistralai/mixtral-8x7b-instruct-v01
```

## Configuration Options

### Text Generation Parameters

The WatsonX provider supports the full range of text generation parameters from the IBM SDK:

| Parameter             | Type     | Description                                |
| --------------------- | -------- | ------------------------------------------ |
| `maxNewTokens`        | number   | Maximum tokens to generate (default: 100)  |
| `minNewTokens`        | number   | Minimum tokens before stop sequences apply |
| `temperature`         | number   | Sampling temperature (0-2)                 |
| `topP`                | number   | Nucleus sampling parameter (0-1)           |
| `topK`                | number   | Top-k sampling parameter                   |
| `decodingMethod`      | string   | `'greedy'` or `'sample'`                   |
| `stopSequences`       | string[] | Sequences that cause generation to stop    |
| `repetitionPenalty`   | number   | Penalty for repeated tokens                |
| `randomSeed`          | number   | Seed for reproducible outputs              |
| `timeLimit`           | number   | Time limit in milliseconds                 |
| `truncateInputTokens` | number   | Max input tokens before truncation         |
| `includeStopSequence` | boolean  | Include stop sequence in output            |
| `lengthPenalty`       | object   | Length penalty configuration               |

#### Example with Parameters

```yaml
providers:
  - id: watsonx:ibm/granite-3-3-8b-instruct
    config:
      temperature: 0.7
      topP: 0.9
      topK: 50
      maxNewTokens: 1024
      stopSequences: ['END', 'STOP']
      repetitionPenalty: 1.1
      decodingMethod: sample
```

#### Length Penalty

For more control over output length:

```yaml
providers:
  - id: watsonx:ibm/granite-3-3-8b-instruct
    config:
      lengthPenalty:
        decayFactor: 1.5
        startIndex: 10
```

## Chat Mode

WatsonX also supports chat-style interactions using the `textChat` API. Use the `watsonx:chat:` prefix:

```yaml
providers:
  - id: watsonx:chat:ibm/granite-3-3-8b-instruct
    config:
      temperature: 0.7
      maxNewTokens: 1024
```

Chat mode automatically parses messages in JSON format:

```yaml
prompts:
  - |
    [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "{{question}}"}
    ]

providers:
  - watsonx:chat:ibm/granite-3-3-8b-instruct
```

For plain text prompts, the chat provider automatically wraps them as a user message.

### Chat vs Text Generation

| Feature         | Text Generation (`watsonx:`) | Chat (`watsonx:chat:`)       |
| --------------- | ---------------------------- | ---------------------------- |
| API Method      | `generateText`               | `textChat`                   |
| Input Format    | Plain text                   | Messages array or plain text |
| Best For        | Completion tasks             | Conversational applications  |
| System Messages | Not supported                | Supported                    |

## Environment Variables

| Variable                  | Description                                 |
| ------------------------- | ------------------------------------------- |
| `WATSONX_AI_APIKEY`       | IBM Cloud API key for IAM authentication    |
| `WATSONX_AI_BEARER_TOKEN` | Bearer token for token-based authentication |
| `WATSONX_AI_PROJECT_ID`   | WatsonX project ID                          |
| `WATSONX_AI_AUTH_TYPE`    | Force auth type: `iam` or `bearertoken`     |

## Migrating from IBM BAM

The IBM BAM provider has been deprecated (sunset March 2025). To migrate:

1. Change provider prefix from `bam:` to `watsonx:`
2. Update authentication to use WatsonX credentials
3. Update model IDs to WatsonX equivalents (e.g., `ibm/granite-3-3-8b-instruct`)
