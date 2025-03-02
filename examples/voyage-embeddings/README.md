# Voyage AI Embeddings Example

This example demonstrates how to use promptfoo with Voyage AI's embedding models for semantic search, text similarity, and other vector-based operations.

## Quick Start

```bash
npx promptfoo@latest init --example voyage-embeddings
```

## Configuration

1. Set up your Voyage AI credentials:

```bash
export VOYAGE_API_KEY=your_key_here
```

2. Review and customize:
   - `promptfooconfig.yaml`: Configure embedding models and parameters
   - Test cases and comparison settings
   - Similarity thresholds and metrics

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View detailed results:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- Embedding quality and consistency
- Semantic similarity measurements
- Cross-encoder performance
- Text matching capabilities
- Vector operations and comparisons

## Example Structure

The example includes:

- `promptfooconfig.yaml`: Main configuration file
- Test cases with text pairs for similarity comparison
- Embedding model configurations
- Evaluation metrics for vector similarity

## Implementation Details

The example demonstrates:

- How to generate embeddings from text
- Comparing text similarity using embeddings
- Configuring different embedding models
- Setting up similarity thresholds
- Processing and evaluating vector results

## Additional Resources

- [Voyage AI Documentation](https://docs.voyageai.com/)
- [Embeddings Guide](https://promptfoo.dev/docs/guides/embeddings)
- [Vector Similarity Guide](https://promptfoo.dev/docs/guides/vector-similarity)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
