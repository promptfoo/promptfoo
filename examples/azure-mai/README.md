# azure-mai (Microsoft MAI models on Azure AI Foundry)

You can run this example with:

```bash
npx promptfoo@latest init --example azure-mai
cd azure-mai
```

Evaluate Microsoft's first-party **MAI** models — offered as [Foundry Models sold by Azure](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure) — with promptfoo. This example focuses on **image generation** with `MAI-Image-2.5` via the dedicated `azure:image` provider, and shows how to add reasoning/chat MAI models via `azure:chat`.

## Environment Variables

This example requires:

- `AZURE_API_HOST` — your Foundry resource endpoint, e.g. `your-resource.services.ai.azure.com`
- `AZURE_API_KEY` — a resource key (or authenticate with `az login` for Microsoft Entra ID)

## Quick Start

```bash
# 1. Deploy an MAI image model to a Microsoft Foundry (AIServices) resource
az cognitiveservices account deployment create \
  --name <RESOURCE> --resource-group <RG> \
  --deployment-name mai-image-2-5 \
  --model-name MAI-Image-2.5 --model-format Microsoft \
  --model-version 2026-06-02 --sku-name GlobalStandard --sku-capacity 1

# 2. Point promptfoo at the resource
export AZURE_API_HOST=<RESOURCE>.services.ai.azure.com
export AZURE_API_KEY=<key>

# 3. Run the eval (images cost ~$0.03 each, so disable caching for fresh runs)
promptfoo eval --no-cache

# 4. View the generated images
promptfoo view
```

## What's in this Example

- `promptfooconfig.yaml` — generates images with `MAI-Image-2.5` through the Microsoft `azure:image` provider, reporting per-image token usage and cost from the API's `usage` response
- `promptfooconfig.vision-judge.yaml` — uses a vision LLM as a judge on the generated images (see below)
- Shows how to wire reasoning/chat MAI models (`MAI-Thinking-1`, `MAI-DS-R1`) via `azure:chat`

## Providers

### Image generation (`azure:image`)

```yaml
providers:
  - id: azure:image:mai-image-2-5
    config:
      model: MAI-Image-2.5 # cost-reporting id (deployment names can't contain dots)
      width: 1024 # min 768; width * height <= 1,048,576
      height: 1024
```

The image is returned as a base64 PNG. promptfoo stores large base64 media as a blob reference (`promptfoo://blob/...`), so assertions should accept either the blob ref or an inline `data:image/...` URL.

### Reasoning chat (`azure:chat`)

`MAI-Thinking-1` and `MAI-DS-R1` are reasoning models (auto-detected by name). Uncomment the chat provider in `promptfooconfig.yaml` once one is deployed in your region:

```yaml
providers:
  - id: azure:chat:mai-thinking-1
    config:
      max_completion_tokens: 2048
```

## LLM-as-judge on images (vision grading)

`promptfooconfig.vision-judge.yaml` grades each generated image with a vision-capable LLM. It uses a custom `rubricPrompt` that passes the image to the grader as an `image_url` block, so the judge evaluates the actual picture rather than a text description.

Run it with inline media so `{{output}}` is a base64 data URL the grader can read:

```bash
PROMPTFOO_INLINE_MEDIA=true promptfoo eval -c promptfooconfig.vision-judge.yaml --no-cache
```

> **Why inline media?** With promptfoo's default media handling, an image output is stored as a `promptfoo://blob/...` reference, which a hosted grader's API can't fetch. `PROMPTFOO_INLINE_MEDIA=true` keeps the output as an inline data URL the vision model can read directly.

## Notes

The newest MAI text models roll out region-by-region and may be in private preview. Run `az cognitiveservices model list --location <region>` to see what your subscription can deploy. See the [Azure provider docs](https://www.promptfoo.dev/docs/providers/azure/#using-microsoft-mai-models) for details.
