# azure-mai (Microsoft MAI models on Azure AI Foundry)

You can run this example with:

```bash
npx promptfoo@latest init --example azure-mai
cd azure-mai
```

Evaluate Microsoft's first-party **MAI** models with promptfoo. This example compares the image models `MAI-Image-2.7` and `MAI-Image-2.7-Flash` (Preview [Foundry Models sold by Azure](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)) through the dedicated `azure:image` provider, runs the `MAI-Thinking-1` reasoning model through `azure:chat`, and shows `MAI-Code-2-Flash` through `azure:responses`.

## Environment Variables

This example requires:

- `AZURE_API_HOST` — your Foundry resource endpoint, e.g. `your-resource.services.ai.azure.com`
- `AZURE_API_KEY` — a resource key (or authenticate with `az login` for Microsoft Entra ID)

## Quick Start

```bash
# 1. Deploy the MAI image models to a Microsoft Foundry (AIServices) resource
az cognitiveservices account deployment create \
  --name <RESOURCE> --resource-group <RG> \
  --deployment-name mai-image-2-7 \
  --model-name MAI-Image-2.7 --model-format Microsoft \
  --model-version 2026-11-02 --sku-name GlobalStandard --sku-capacity 1
az cognitiveservices account deployment create \
  --name <RESOURCE> --resource-group <RG> \
  --deployment-name mai-image-2-7-flash \
  --model-name MAI-Image-2.7-Flash --model-format Microsoft \
  --model-version 2026-11-02 --sku-name GlobalStandard --sku-capacity 1

# 2. Point promptfoo at the resource
export AZURE_API_HOST=<RESOURCE>.services.ai.azure.com
export AZURE_API_KEY=<key>

# 3. Run the eval (each 1024x1024 image costs about $0.035 on MAI-Image-2.7 and $0.01 on Flash)
promptfoo eval --no-cache

# 4. View the generated images
promptfoo view
```

## What's in this Example

- `promptfooconfig.yaml` — generates images with `MAI-Image-2.7` and `MAI-Image-2.7-Flash` (transparent background) through the `azure:image` provider, reporting per-image token usage and cost from the API's token counts
- `promptfooconfig.vision-judge.yaml` — uses a vision LLM as a judge on the generated images (see below)
- `promptfooconfig.thinking.yaml` — runs `MAI-Thinking-1` on short reasoning questions through `azure:chat`
- `promptfooconfig.code.yaml` — compares `MAI-Code-2-Flash` at low and max reasoning effort on coding tasks through `azure:responses` (limited-access preview; see below)

## Providers

### Image generation (`azure:image`)

```yaml
providers:
  - id: azure:image:mai-image-2-7
    config:
      model: MAI-Image-2.7 # cost-reporting id (deployment names can't contain dots)
      width: 2048 # min 768 per side; up to 2048x2048 on 2.7, 1536x1536 on 2.6
      height: 2048
      passthrough:
        background: transparent # MAI-Image-2.7 models only
```

The image is returned as a base64 PNG. promptfoo stores large base64 media as a blob reference (`promptfoo://blob/...`), so assertions should accept either the blob ref or an inline `data:image/...` URL.

### Reasoning chat (`azure:chat`)

`MAI-Thinking-1` is a reasoning model (auto-detected by name — promptfoo sends `max_completion_tokens` and `reasoning_effort` and drops `temperature`). Deploy it and run the reasoning config:

```bash
az cognitiveservices account deployment create \
  --name <RESOURCE> --resource-group <RG> \
  --deployment-name mai-thinking-1 \
  --model-name MAI-Thinking-1 --model-format Microsoft \
  --model-version 2026-06-01 --sku-name GlobalStandard --sku-capacity 50

promptfoo eval -c promptfooconfig.thinking.yaml --no-cache
```

Cost is reported from Azure's Global Standard rates ($2/1M input, $0.20/1M cached input, $8/1M output, with reasoning tokens billed as output). Reasoning can take a minute or more per answer.

### Agentic coding (`azure:responses`)

`MAI-Code-2-Flash` is served only through the Responses API. It is a **limited-access preview** on Microsoft Foundry: a subscription without access gets `SpecialFeatureOrQuotaIdRequired` when it creates the deployment. Once you have access:

```bash
az cognitiveservices account deployment create \
  --name <RESOURCE> --resource-group <RG> \
  --deployment-name mai-code-2-flash \
  --model-name mai-code-2-flash --model-format Microsoft \
  --model-version 2026-11-17 --sku-name GlobalStandard --sku-capacity 10

promptfoo eval -c promptfooconfig.code.yaml --no-cache
```

promptfoo detects deployments named `mai-code-2*` as reasoning models: `reasoning_effort` (`low`, `medium`, `high`, `xhigh`, or `max`) is sent as `reasoning.effort` and `temperature` is omitted. Cost estimates need the deployment to be named exactly `mai-code-2-flash` (or `MAI-Code-2-Flash`); for any other name, set `modelName: MAI-Code-2-Flash`. Reasoning tokens count toward `max_output_tokens`, so leave headroom at high effort. Cost is reported from Azure's Global Standard rates ($0.05/1M input, $0.005/1M cached input, $0.25/1M output).

## LLM-as-judge on images (vision grading)

`promptfooconfig.vision-judge.yaml` grades each generated image with a vision-capable LLM. It uses a custom `rubricPrompt` that passes the image to the grader as an `image_url` block, so the judge evaluates the actual picture rather than a text description.

Run it with inline media so `{{output}}` is a base64 data URL the grader can read:

```bash
PROMPTFOO_INLINE_MEDIA=true promptfoo eval -c promptfooconfig.vision-judge.yaml --no-cache
```

> **Why inline media?** With promptfoo's default media handling, an image output is stored as a `promptfoo://blob/...` reference, which a hosted grader's API can't fetch. `PROMPTFOO_INLINE_MEDIA=true` keeps the output as an inline data URL the vision model can read directly.

## Notes

`MAI-Image-2.7` and `MAI-Image-2.7-Flash` are in preview, and `MAI-Image-2.6` and `MAI-Image-2.6-Flash` are generally available. The 2.5 image models retire on November 24, 2026. `MAI-Code-2-Flash` and `MAI-Code-1.1-Flash` are limited access, and `MAI-DS-R1` is deprecated. Run `az cognitiveservices model list --location <region>` to see what your subscription can actually deploy. See the [Azure provider docs](https://www.promptfoo.dev/docs/providers/azure/#using-microsoft-mai-models) for details.
