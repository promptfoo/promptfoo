# mistral (Mistral AI Chat Models)

Compare Mistral chat and reasoning models, then grade their responses with Mistral models and embeddings.

You can run this example with:

```bash
npx promptfoo@latest init --example mistral
cd mistral
```

## Environment Variables

This example requires:

- `MISTRAL_API_KEY` - Your Mistral API key (get it from [console.mistral.ai](https://console.mistral.ai))

## What This Example Shows

- **Mathematical Reasoning**: AIME2024 competition problems with Mistral Medium 3.5
- **Model Comparison**: Compare Mistral's different model capabilities
- **Reasoning Models**: Compare Mistral Medium 3.5 and Mistral Small 4 with reasoning enabled
- **Chat Capabilities**: General conversation and task completion
- **Mistral-powered Evaluation**: Use Mistral models for grading instead of OpenAI
- **Mistral Embeddings**: Use Mistral's embedding model for similarity checks

## Models Demonstrated

### Reasoning Models

- **Mistral Medium 3.5** (`mistral-medium-3-5`): Multimodal model with adjustable reasoning. The reasoning configs set `reasoning_effort: high`.

> `magistral-small-latest` still resolves to the deprecated `magistral-small-2509` native-reasoning snapshot. These examples use the **Mistral Small 4** alias, `mistral-small-latest`. Enable Small 4's reasoning mode with `reasoning_effort: high`.

### Chat Models

- **Mistral Medium 3.5** (`mistral-medium-latest` / `mistral-medium-3-5`): Text, vision, and reasoning model
- **Mistral Large 3** (`mistral-large-latest` → `mistral-large-2512`): Text and vision model
- **Mistral Small 4** (`mistral-small-latest` → `mistral-small-2603`): Text, vision, and reasoning model

### Evaluation Models

- **Grading**: Uses `mistral-large-latest` for LLM-as-a-judge evaluation
- **Embeddings**: Uses `mistral-embed` for semantic similarity checks

## Running the Example

```bash
# Set your API key
export MISTRAL_API_KEY=your_api_key_here

# Run the evaluation
promptfoo eval

# View results in the web UI
promptfoo view
```

## Available Configurations

This example includes multiple configuration files for different use cases:

### Mathematical Reasoning

- **`promptfooconfig.aime2024.yaml`** - Advanced mathematical competition problems (AIME2024 dataset)
- **`promptfooconfig.reasoning.yaml`** - Step-by-step logical problem solving

### Model Capabilities

- **`promptfooconfig.comparison.yaml`** - Compare the configured Mistral reasoning and chat models
- **`promptfooconfig.code-generation.yaml`** - Multi-language programming with Codestral
- **`promptfooconfig.multimodal.yaml`** - Vision and text processing

### Advanced Features

- **`promptfooconfig.tool-use.yaml`** - Function calling and tool integration
- **`promptfooconfig.tool-routing.yaml`** - End-to-end QA for tool-only, mixed content+tool_calls, file-based tools, and plain chat output
- **`promptfooconfig.json-mode.yaml`** - Structured JSON output generation
- **`promptfooconfig.yaml`** - Main example with evaluation using Mistral models

Run any specific configuration:

```bash
npx promptfoo@latest eval -c promptfooconfig.aime2024.yaml  # Mathematical reasoning
npx promptfoo@latest eval -c promptfooconfig.comparison.yaml  # Model comparison
```

## Additional Resources

- **[Mistral Provider Documentation](https://www.promptfoo.dev/docs/providers/mistral/)** - Configuration options
- **[Mistral model catalog](https://docs.mistral.ai/models/overview)** - Availability and pricing
