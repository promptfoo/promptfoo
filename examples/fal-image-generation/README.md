# fal-image-generation (fal.ai Image Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example fal-image-generation
```

A simple example demonstrating how to evaluate fal.ai's state-of-the-art image generation models with promptfoo, comparing FLUX models for creative image generation.

## Environment Variables

This example requires the following environment variable:

- `FAL_KEY` - Your fal.ai API key (get it from [fal.ai dashboard](https://fal.ai/dashboard/keys))

You can set this in a `.env` file or directly in your environment:

```bash
export FAL_KEY=your-fal-key-here
```

## Quick Start

```bash
# Create this example
npx promptfoo@latest init --example fal-image-generation

# Set your API key
export FAL_KEY=your-fal-key-here

# Install the fal.ai client
npm install @fal-ai/client

# Run the evaluation
promptfoo eval

# View the results
promptfoo view
```

## What's in this Example

This example showcases:

- **Two FLUX Models**: Compares FLUX Schnell (speed) vs FLUX Dev (quality)
- **Creative Prompts**: Tests various artistic styles and imaginative subjects
- **Model-Specific Configurations**: Different settings optimized for each model
- **Artistic Evaluation**: Diverse creative scenarios from classical to modern styles

### Models Tested

1. **FLUX Schnell** (`fal-ai/flux/schnell`) - Ultra-fast generation (4 inference steps)
2. **FLUX Dev** (`fal-ai/flux/dev`) - High-quality balanced model (28 inference steps)

### Test Scenarios

- **Classical Art**: Van Gogh, Picasso, Monet-inspired generations
- **Animation Styles**: Studio Ghibli aesthetic
- **Modern Concepts**: Cyberpunk and futuristic themes
- **Historical Art**: Renaissance and Japanese woodblock print styles

## Key Features

- **Seed Control**: Reproducible results with fixed seeds (seed: 42)
- **Custom Parameters**: Guidance scale and inference steps optimized per model
- **Markdown Output**: Images are returned as markdown for easy viewing
- **Caching**: Automatic caching of expensive image generation calls

## Model Comparison

### FLUX Schnell

- **Speed**: Ultra-fast with 4 inference steps
- **Guidance Scale**: 3.5 for balanced creativity
- **Best For**: Quick iterations and rapid prototyping

### FLUX Dev

- **Quality**: High-quality with 28 inference steps
- **Guidance Scale**: 7.5 for precise prompt following
- **Image Size**: Landscape 4:3 aspect ratio
- **Best For**: Final high-quality outputs

## Configuration Notes

- Both models use the same seed (42) for fair comparison
- Guidance scale affects how closely the model follows the prompt
- Number of inference steps balances quality vs. speed
- FLUX Dev includes custom image sizing for better composition

## Documentation

- [fal.ai Model Gallery](https://fal.ai/models)
- [fal.ai API Documentation](https://docs.fal.ai/)
- [promptfoo fal.ai Provider Documentation](https://promptfoo.dev/docs/providers/fal)
- [FLUX Model Documentation](https://fal.ai/models/fal-ai/flux)

## Pricing Considerations

fal.ai charges per image generated. FLUX Schnell is more cost-effective for experimentation, while FLUX Dev provides higher quality at a higher cost. Check current pricing at [fal.ai/pricing](https://fal.ai/pricing).
