# g-eval (G Eval)

You can run this example with:

```bash
npx promptfoo@latest init --example g-eval
```

This example shows how you can use [G-Eval](https://arxiv.org/abs/2303.16634) with promptfoo, including evaluation of image inputs.

## Basic Text Evaluation

Configure in `promptfooconfig.yaml`. Run with:

```
promptfoo eval
```

## Image Input Evaluation

This example also demonstrates G-Eval's capability to evaluate responses about visual content. We provide an example configuration that evaluates how well models describe images.

### Setup

The example includes pre-generated test images (`test-image.png` and `test-chart.png`). You can use these directly or replace them with your own images.

### Running the Image Evaluation

```bash
promptfoo eval -c promptfooconfig-image.yaml
```

### What it does

The image evaluation example:
- Tests models' ability to describe visual content
- Evaluates descriptions based on multiple criteria:
  - **Accuracy**: Whether descriptions are factual and free from hallucinations
  - **Completeness**: Coverage of important visual elements
  - **Clarity**: Organization and understandability of descriptions
  - **Chart Analysis**: For data visualizations, ability to identify trends and patterns

### Requirements

- An OpenAI API key (for GPT-4o-mini which supports vision)
- Test images (included: `test-image.png` and `test-chart.png`)

### Files

- `promptfooconfig.yaml` - Basic text evaluation configuration
- `promptfooconfig-image.yaml` - Image input evaluation configuration
- `test-image.png` - Sample image with geometric shapes
- `test-chart.png` - Sample bar chart for data visualization analysis

### Using Your Own Images

You can replace the test images with your own by:
1. Adding your image files to the `examples/g-eval/` directory
2. Updating the `vars` section in `promptfooconfig-image.yaml` to reference your images:

```yaml
tests:
  - vars:
      image: file://your-image.png
    assert:
      # Your G-Eval criteria here
```
