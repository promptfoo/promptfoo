# azure-openai-decisions (Azure OpenAI Decisions API)

Classify CI failures, estimate infrastructure-failure probability, and score impact with one Azure Decisions request per test case.

## Setup

```sh
npx promptfoo@latest init --example azure-openai-decisions
cd azure-openai-decisions
```

Deploy a supported model in an Azure region that supports the [Decisions API](https://learn.microsoft.com/azure/foundry/openai/how-to/decisions).
Replace `gpt-6-luna` in the provider ID with your deployment name.

Set your resource endpoint and API key:

```sh
export AZURE_OPENAI_API_BASE_URL=https://YOUR-RESOURCE.openai.azure.com
export AZURE_OPENAI_API_KEY=your-azure-api-key
```

Alternatively, omit the API key and use Microsoft Entra ID authentication, such as `az login`. Promptfoo uses the same Azure credentials as its other Azure providers.

```sh
npx promptfoo@latest eval --no-cache -o results.json
npx promptfoo@latest eval -c promptfooconfig.grading.yaml --no-cache -o grading-results.json
```

Inspect the exported answers, probabilities, token usage, and assertion results.
The assertions are example thresholds; calibrate them on representative inputs.

`promptfooconfig.yaml` tests Decisions directly.
`promptfooconfig.grading.yaml` uses the same deployment for `llm-rubric` and `classifier` assertions. Refusals are typed answers for direct questions and fail grading assertions.
