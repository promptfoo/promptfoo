# WatsonX

[IBM WatsonX](https://www.ibm.com/watsonx) offers a range of enterprise-grade foundation models optimized for various business use cases. This provider supports several powerful models from the `Granite` and `Llama` series, along with additional models for code generation, multilingual tasks, vision processing, and more.

## Supported Models

- **Granite Series**

  - `granite-20b-multilingual`
  - `granite-34b-code-instruct`
  - `granite-20b-code-instruct`
  - `granite-8b-code-instruct`
  - `granite-3b-code-instruct`
  - `granite-8b-japanese`
  - `granite-7b-lab`

- **Llama Series**

  - `llama-3-2-90b-vision-instruct`
  - `llama-3-2-11b-vision-instruct`
  - `llama-3-2-3b-instruct`
  - `llama-3-2-1b-instruct`
  - `llama-guard-3-11b-vision`
  - `llama-3-1-70b-instruct`
  - `llama-3-1-8b-instruct`
  - `llama3-llava-next-8b-hf`
  - `llama-3-405b-instruct`
  - `llama-3-70b-instruct`
  - `llama-3-8b-instruct`

- **Additional Models**
  - `allam-1-13b-instruct`
  - `codellama-34b-instruct`
  - `elyza-japanese-llama-2-7b-instruct`
  - `flan-t5-xl-3b`
  - `flan-t5-xxl-11b`
  - `flan-ul2-20b`
  - `jais-13b-chat`
  - `llama2-13b-dpo-v7`
  - `mistral-large-2`
  - `mixtral-8x7b-instruct`
  - `mt0-xxl-13b`

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

   **Option 1: IAM Authentication**

   ```sh
   export WATSONX_AI_AUTH_TYPE=iam
   export WATSONX_AI_APIKEY=your-ibm-cloud-api-key
   ```

   **Option 2: Bearer Token Authentication**

   ```sh
   export WATSONX_AI_AUTH_TYPE=bearertoken
   export WATSONX_AI_BEARER_TOKEN=your-ibm-cloud-bearer-token
   ```

   Then set your project ID:

   ```sh
   export WATSONX_AI_PROJECT_ID=your-ibm-project-id
   ```

   Note: If `WATSONX_AI_AUTH_TYPE` is not set, the provider will automatically choose the authentication method based on which credentials are available, preferring IAM authentication if both are present.

3. Alternatively, you can configure the authentication and project ID directly in the configuration file:

   ```yaml
   providers:
     - id: watsonx:ibm/granite-13b-chat-v2
       config:
         # Option 1: IAM Authentication
         apiKey: your-ibm-cloud-api-key

         # Option 2: Bearer Token Authentication
         # apiBearerToken: your-ibm-cloud-bearer-token

         projectId: your-ibm-project-id
         serviceUrl: https://us-south.ml.cloud.ibm.com
   ```

### Usage Examples

Once configured, you can use the WatsonX provider to generate text responses based on prompts. Here’s an example of using the **Granite 13B Chat V2** model to answer a question:

```yaml
providers:
  - watsonx:ibm/granite-13b-chat-v2 # for Meta models, use watsonx:meta-llama/llama-3-2-1b-instruct

prompts:
  - "Answer the following question: '{{question}}'"

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```
