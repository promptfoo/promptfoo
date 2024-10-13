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

Before integrating the WatsonX provider, ensure you have:

1. **IBM Cloud Account**: You need an IBM Cloud account to get API access to WatsonX models.
2. **API Keys and Project ID**: Retrieve your API key, project ID, and service URL from your IBM Cloud account.

## Installation

To install the WatsonX provider, use the following steps:

1. Install the necessary dependencies:

   ```sh
   npm install @ibm-cloud/watsonx-ai ibm-cloud-sdk-core
   ```

2. Set up the necessary environment variables:

   ```sh
   export WATSONX_API_KEY=your-ibm-cloud-api-key
   export WATSONX_PROJECT_ID=your-ibm-project-id
   ```

3. Alternatively, you can configure the API key and project ID directly in the configuration file.

   ```yaml
   providers:
     - id: watsonx:ibm/granite-13b-chat-v2
     config:
       apiKey: your-ibm-cloud-api-key
       projectId: your-ibm-project-id
       serviceUrl: https://us-south.ml.cloud.ibm.com
   ```

### Usage Examples

Once configured, you can use the WatsonX provider to generate text responses based on prompts. Here’s an example of using the **Granite 13B Chat V2** model to answer a question:

```yaml
providers:
  - watsonx:ibm/granite-13b-chat-v2

prompts:
  - "Answer the following question: '{{question}}'"

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```
