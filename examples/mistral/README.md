# mistral (Mistral AI Chat Models)

This example demonstrates Mistral AI's chat models, including their new Magistral reasoning models, traditional chat models, and shows how to use Mistral models for evaluation grading and embeddings.

You can run this example with:

```bash
npx promptfoo@latest init --example mistral
```

## Environment Variables

This example requires:

- `MISTRAL_API_KEY` - Your Mistral API key (get it from [console.mistral.ai](https://console.mistral.ai))

## What This Example Shows

- **Mathematical Reasoning**: AIME2024 competition problems with Magistral models
- **Model Comparison**: Compare Mistral's different model capabilities
- **Reasoning Models**: Showcase Magistral Small and Medium for complex problems
- **Chat Capabilities**: General conversation and task completion
- **Mistral-powered Evaluation**: Use Mistral models for grading instead of OpenAI
- **Mistral Embeddings**: Use Mistral's embedding model for similarity checks

## Models Demonstrated

### Reasoning Models (Magistral)

- **Magistral Medium** (`magistral-medium-latest`): Enterprise reasoning model ($2/$5 per M tokens)
- **Magistral Small** (`magistral-small-latest`): Open-source reasoning model ($0.5/$1.5 per M tokens)

### Traditional Chat Models

- **Mistral Large** (`mistral-large-latest`): Top-tier model for complex tasks
- **Mistral Medium** (`mistral-medium-latest`): Balanced performance and cost
- **Mistral Small** (`mistral-small-latest`): Efficient for simple tasks

### Evaluation Models

- **Grading**: Uses `mistral-large-latest` for LLM-as-a-judge evaluation
- **Embeddings**: Uses `mistral-embed` for semantic similarity checks

## Key Features Demonstrated

- **Multi-model comparison**: Compare performance across different Mistral models
- **Reasoning capabilities**: Step-by-step problem solving with Magistral models
- **Cost optimization**: Balance performance vs. cost across model tiers
- **Self-evaluation**: Use Mistral models to grade their own outputs
- **Semantic similarity**: Mistral embeddings for content comparison

## Running the Example

```bash
# Set your API key
export MISTRAL_API_KEY=your_api_key_here

# Run the evaluation
promptfoo eval

# View results in the web UI
promptfoo view
```

## Configuration Highlights

This example showcases several advanced promptfoo features:

- **Provider overrides** for grading and embeddings
- **Multiple assertion types** including llm-rubric and similarity
- **Cost tracking** across different model tiers
- **Mixed scenarios** from simple chat to complex reasoning

The evaluation uses Mistral models end-to-end, providing a comprehensive view of their ecosystem capabilities.

## Available Configurations

This example includes multiple configuration files for different use cases:

### Mathematical Reasoning

- **`promptfooconfig.aime2024.yaml`** - Advanced mathematical competition problems (AIME2024 dataset)
- **`promptfooconfig.reasoning.yaml`** - Step-by-step logical problem solving

### Model Capabilities

- **`promptfooconfig.comparison.yaml`** - Compare reasoning across all Mistral models
- **`promptfooconfig.code-generation.yaml`** - Multi-language programming with Codestral
- **`promptfooconfig.multimodal.yaml`** - Vision and text processing with Pixtral

### Advanced Features

- **`promptfooconfig.tool-use.yaml`** - Function calling and tool integration
- **`promptfooconfig.json-mode.yaml`** - Structured JSON output generation
- **`promptfooconfig.yaml`** - Main example with evaluation using Mistral models

Run any specific configuration:

```bash
npx promptfoo@latest eval -c promptfooconfig.aime2024.yaml  # Mathematical reasoning
npx promptfoo@latest eval -c promptfooconfig.comparison.yaml  # Model comparison
```

## Additional Resources

- **[Magistral AIME2024 Reasoning Guide](/docs/guides/mistral-magistral-aime2024)** - Comprehensive guide to mathematical reasoning evaluation
- **[Mistral Provider Documentation](/docs/providers/mistral)** - Complete API reference and configuration options
- **[Mistral Magistral Announcement](https://mistral.ai/news/magistral/)** - Official announcement and technical details
