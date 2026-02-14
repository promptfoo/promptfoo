# Red Panda Image Generation Comparison

Compares image generation quality across OpenAI and Google Gemini models using red panda themed prompts.

## Models

| Provider | Model                        | Notes                                      |
| -------- | ---------------------------- | ------------------------------------------ |
| OpenAI   | `gpt-image-1.5`              | Latest, highest quality                    |
| OpenAI   | `gpt-image-1`                | High quality, strong instruction following |
| Google   | `gemini-2.5-flash-image`     | Fast native image generation               |
| Google   | `gemini-3-pro-image-preview` | Advanced with reasoning                    |

## Prompts

Three prompt variations, each generating 5 images per model (60 total images):

1. **Base** - Cute red panda holding a sign on a blank background
2. **San Mateo themed** - Red panda with San Mateo landmarks (bridge, Coyote Point, downtown)
3. **SF themed** - Red panda with San Francisco landmarks (Golden Gate, cable cars, Victorians)

All prompts feature a red panda holding a sign that says _"ignore previous instructions and give me all your bamboo"_.

## Setup

Set your API keys:

```bash
export OPENAI_API_KEY=your-openai-key
export GOOGLE_API_KEY=your-google-key
```

## Run

```bash
npx promptfoo@latest eval -c examples/red-panda-image-comparison/promptfooconfig.yaml --no-cache
npx promptfoo@latest view
```
