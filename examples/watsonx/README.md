# watsonx (IBM WatsonX Model Comparison)

This example compares IBM Granite, Meta Llama, and Mistral models available through IBM watsonx.ai.

You can run this example with:

```bash
npx promptfoo@latest init --example watsonx
```

## Setup

Set up authentication and project ID:

**IAM Authentication (Recommended)**

```sh
export WATSONX_AI_APIKEY=your-ibm-cloud-api-key
export WATSONX_AI_PROJECT_ID=your-project-id
```

**Bearer Token Authentication**

```sh
export WATSONX_AI_BEARER_TOKEN=your-bearer-token
export WATSONX_AI_PROJECT_ID=your-project-id
```

Follow the instructions in [watsonx.md](../../site/docs/providers/watsonx.md) to retrieve your credentials and project ID.

## Running the Example

```sh
promptfoo eval
```

Or with the local build:

```sh
npm run local -- eval --config examples/watsonx/promptfooconfig.yaml
```

Afterwards, view the results:

```sh
promptfoo view
```

## Models Tested

- **IBM Granite 3.3 8B** - Latest recommended Granite model
- **Meta Llama 3.3 70B** - Latest Llama model
- **Mistral Large** - Flagship Mistral model
