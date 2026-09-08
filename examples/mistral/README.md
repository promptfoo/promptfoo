# mistral (Mistral AI Chat Models)

This example demonstrates Mistral AI's current chat and reasoning models, including multimodal models, and shows how to use Mistral models for evaluation grading and embeddings.

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

- **Mistral Medium 3.5** (`mistral-medium-3-5`): Current multimodal model with adjustable reasoning ($1.50/$7.50 per 1M tokens, 256k context) — the reasoning showcase in these examples.

> `magistral-small-latest` still resolves to the deprecated `magistral-small-2509` native-reasoning snapshot. These examples use the current **Mistral Small 4** alias, `mistral-small-latest` (a hybrid model, $0.15/$0.60 per 1M). Enable Small 4's reasoning mode with `reasoning_effort: high`.

### Chat Models

- **Mistral Medium 3.5** (`mistral-medium-latest` / `mistral-medium-3-5`): Frontier agentic/coding multimodal model ($1.50/$7.50 per 1M, 256k context)
- **Mistral Large 3** (`mistral-large-latest` → `mistral-large-2512`): General-purpose multimodal model ($0.50/$1.50 per 1M, 256k context)
- **Mistral Small 4** (`mistral-small-latest` → `mistral-small-2603`): Hybrid instruct/reasoning/coding model ($0.15/$0.60 per 1M, 256k context)

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
- **`promptfooconfig.multimodal.yaml`** - Vision and text processing with current Mistral multimodal models

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

- **[Mistral Provider Documentation](/docs/providers/mistral)** - Complete API reference and configuration options
- **[Mistral Magistral Announcement](https://mistral.ai/news/magistral/)** - Official announcement and technical details
