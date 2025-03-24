# UnsafeBench Multi-Modal Model Evaluation

This example demonstrates how to use promptfoo to evaluate multi-modal models against potentially unsafe imagery using the UnsafeBench plugin. The plugin tests how well models detect and refuse to engage with harmful content.

## Prerequisites

- A Hugging Face account with access to the [UnsafeBench dataset](https://huggingface.co/datasets/yiting/UnsafeBench)
- Hugging Face API token (request dataset access first)
- An API key for a vision-capable model (e.g., OpenAI GPT-4o)

## Setup

1. Set your Hugging Face API token:

```bash
export HF_TOKEN=your_huggingface_token
```

2. Set your model provider API key (example for OpenAI):

```bash
export OPENAI_API_KEY=your_openai_api_key
```

## Running the Example

Run the red team evaluation:

```bash
npx promptfoo redteam run -c examples/redteam-multi-modal/promptfooconfig.unsafebench.yaml
```

## How It Works

1. The UnsafeBench plugin fetches images labeled as "unsafe" from the UnsafeBench dataset
2. Images are automatically converted to base64 format (even if originally provided as URLs)
3. Images are filtered by category (Violence, Sexual, Hate)
4. The `image-prompt.json` defines a system prompt that instructs the model to:
   - Provide accurate image descriptions
   - Adhere to ethical guidelines
   - Refuse to describe explicit, violent, or disturbing imagery
5. Results are evaluated to see if the model appropriately refuses to engage with harmful content

## Understanding the Results

Look for these patterns in the results:

- **Good responses**: Model identifies unsafe content and politely refuses to describe it
- **Poor responses**: Model describes harmful content in detail or fails to identify it as problematic

## Technical Details

The plugin handles multiple image formats:
- Base64-encoded image data
- Image URLs from the dataset API
- Image objects with `src` properties

In all cases, the plugin ensures the image is properly converted to base64 format before passing it to the model, allowing for consistent handling regardless of the source format.

## Customization

You can customize the configuration by:

1. Changing the target categories in the configuration:
```yaml
plugins:
  - id: unsafebench
    config:
      categories:
        - Violence
        - Sexual
        - Hate
        # Other available categories: 
        # - Deception
        # - Harassment
        # - Illegal activity
        # - Political
        # - Public and personal health
        # - Self-harm
        # - Shocking
        # - Spam
```

2. Adjusting the number of test cases:
```yaml
redteam:
  numTests: 5  # Change to desired number
```

3. Using a different vision-capable model:
```yaml
targets:
  - id: anthropic:claude-3-5-sonnet-20240620
    label: claude-vision
```

## Important Notes

- The UnsafeBench dataset contains potentially disturbing imagery
- This tool is intended for research and evaluation purposes only
- Ensure you comply with all API provider terms of service 