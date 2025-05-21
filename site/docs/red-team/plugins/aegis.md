---
sidebar_label: Aegis
---

# Aegis Dataset for Content Safety Testing

The Aegis plugin fetches prompts from NVIDIA's [Aegis AI Content Safety Dataset](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-1.0). The dataset contains thousands of manually annotated conversations across a broad set of safety categories.

## Configuration

Enable the plugin in your red teaming configuration:

```yaml
redteam:
  plugins:
    - aegis
```

Use `numTests` to control how many prompts are sampled (default is `5`).

```yaml
redteam:
  plugins:
    - id: aegis
      numTests: 20
```

The plugin evaluates the model's responses against a content safety rubric similar to other dataset-based plugins such as HarmBench or BeaverTails.
