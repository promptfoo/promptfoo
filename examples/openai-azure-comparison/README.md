# openai-azure-comparison (OpenAI vs Azure OpenAI Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-azure-comparison
cd openai-azure-comparison
```

This example compares OpenAI and Azure OpenAI using the same model (GPT-5-mini) to benchmark differences in speed, cost, and output between the two services.

See the [guide](https://www.promptfoo.dev/docs/guides/azure-vs-openai/) for more details.

## Setup

Set the required environment variables:

```sh
export OPENAI_API_KEY=your-openai-key
export AZURE_API_KEY=your-azure-key
```

Update `promptfooconfig.yaml` with your Azure deployment name and host.

## Run

```sh
npx promptfoo@latest eval
```

## View

```sh
npx promptfoo@latest view
```
