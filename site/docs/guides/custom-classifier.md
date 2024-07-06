---
title: Custom Computer Vision Classifiers with a Few Lines of Code
---

# Custom Computer Vision Classifiers with a Few Lines of Code

Multi-modal models are revolutionizing the way we approach computer vision tasks, offering a rapid and flexible alternative to traditional supervised learning techniques. By leveraging large language models (LLMs), we can quickly set up custom classifiers that perform tasks like image analysis, object detection, and more with minimal code.

In this guide, we'll walk you through setting up an example that compares image analysis tasks using different AI providers. We'll also discuss prompting strategies for multi-modal models, such as class selection, JSON outputs, and enum-based outputs.

## Prompting Strategies

### Class Selection

For tasks where you need to classify images into predefined categories, you can use prompts that ask the model to pick a class from a list. For example:

```
Select the category that best describes the image: a) cat, b) dog, c) bird.
```

### JSON Output

For structured outputs, instruct the model to return results in JSON format. This is useful for extracting multiple attributes or detailed information. For example:

```
Provide a JSON object with the following keys: { "category": "", "confidence": "" }
```

### Enum-Based Output

When the output needs to be constrained to specific values, you can use an enum-based approach. For example:

```
Output one word from the following list that best describes the image: ["cat", "dog", "bird"]
```

## Using a Real Dataset

For this example, we'll use the CIFAR-10 dataset, which consists of 60,000 32x32 color images in 10 different classes. This dataset is commonly used for training machine learning and computer vision models.

## Setting Up the Example

### Prerequisites

Make sure you have the following installed:

- Node.js and npm
- Python 3.9+
- promptfoo (`npm install -g promptfoo`)

### Configuration

#### Create the promptfoo Configuration File

Create a file named `promptfooconfig.yaml`:

```yaml
description: 'Claude vs GPT Image Analysis'

prompts:
  - ./prompt.py:format_image_prompt

providers:
  - id: anthropic:messages:claude-3-5-sonnet-20240620
  - id: openai:gpt-4o

tests:
  - vars:
      image_url: https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Great_Wave_off_Kanagawa2.jpg/640px-Great_Wave_off_Kanagawa2.jpg
      label: Great Wave off Kanagawa

assert:
  - type: icontains
    value: '{{label}}'
  - type: is-json
```

#### Create the Prompt File

Create `prompt.py`:

```python
import base64
import requests

def get_image_base64(image_url: str) -> str:
    response = requests.get(image_url)
    return base64.b64encode(response.content).decode("utf-8")

# System prompt for general image description
system_prompt = "Describe the image in a few words"

# Function to format prompt for image description
def format_image_prompt(context: dict) -> list:
    if context["provider"]["id"] == "anthropic:messages:claude-3-5-sonnet-20240620":
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": get_image_base64(context["vars"]["image_url"])}}]},
        ]
    if context["provider"]["id"] == "openai:gpt-4o":
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [{"type": "image_url", "image_url": {"url": context["vars"]["image_url"]}}]},
        ]
```

### Additional Prompting Strategies

#### Prompt for Class Selection

```python
# System prompt for class selection
system_prompt_class_selection = "Select the category that best describes the image: a) cat, b) dog, c) bird."

def format_class_selection_prompt(context: dict) -> list:
    if context["provider"]["id"].startswith("anthropic") or context["provider"]["id"] == "anthropic:messages:claude-3-5-sonnet-20240620":
        return [
            {"role": "system", "content": system_prompt_class_selection},
            {"role": "user", "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": get_image_base64(context["vars"]["image_url"])}}]},
        ]
    if context["provider"]["id"].startswith("openai"):
        return [
            {"role": "system", "content": system_prompt_class_selection},
            {"role": "user", "content": [{"type": "image_url", "image_url": {"url": context["vars"]["image_url"]}}]},
        ]
    raise ValueError(f"Unsupported provider: {context['provider']}")
```

#### Prompt for JSON Output

```python
# System prompt for JSON output
system_prompt_json_output = "Provide a JSON object with the following keys: { 'category': '', 'confidence': '' }."

def format_json_output_prompt(context: dict) -> list:
    if context["provider"]["id"].startswith("anthropic") or context["provider"]["id"] == "anthropic:messages:claude-3-5-sonnet-20240620":
        return [
            {"role": "system", "content": system_prompt_json_output},
            {"role": "user", "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": get_image_base64(context["vars"]["image_url"])}}]},
        ]
    if context["provider"]["id"].startswith("openai"):
        return [
            {"role": "system", "content": system_prompt_json_output},
            {"role": "user", "content": [{"type": "image_url", "image_url": {"url": context["vars"]["image_url"]}}]},
        ]
    raise ValueError(f"Unsupported provider: {context['provider']}")
```

#### Prompt for Enum-Based Output

```python
# System prompt for enum-based output
system_prompt_enum_output = "Output one word from the following list that best describes the image: ['cat', 'dog', 'bird']."

def format_enum_output_prompt(context: dict) -> list:
    if context["provider"]["id"].startswith("anthropic") or context["provider"]["id"] == "anthropic:messages:claude-3-5-sonnet-20240620":
        return [
            {"role": "system", "content": system_prompt_enum_output},
            {"role": "user", "content": [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": get_image_base64(context["vars"]["image_url"])}}]},
        ]
    if context["provider"]["id"].startswith("openai"):
        return [
            {"role": "system", "content": system_prompt_enum_output},
            {"role": "user", "content": [{"type": "image_url", "image_url": {"url": context["vars"]["image_url"]}}]},
        ]
    raise ValueError(f"Unsupported provider: {context['provider']}")
```

### Tips for Efficient Image Analysis

- **Resizing Images**: Resizing images to a smaller resolution can significantly reduce token costs and improve processing time. For example, resizing images to 128x128 pixels before encoding them can save on both storage and computation costs.

## Running the Example

Execute the following command in your terminal:

```
npx promptfoo@latest eval
```

This command will:

- Generate image analysis prompts for each provider.
- Format the prompts according to the provider's requirements.
- Execute the prompts and collect the results.

### Viewing the Results

After running the evaluation, you can view the results by running:

```
npx promptfoo@latest view
```

This will display a summary of the results, allowing you to compare the performance of different providers.

## Next Steps

To further explore the capabilities of multi-modal models and promptfoo, consider the following:

- **Experiment with Different Providers**: Test the performance of other AI providers to find the best fit for your specific use case.
- **Expand Your Dataset**: Use a larger and more diverse dataset to evaluate the robustness of your classifiers.
- **Refine Prompt Strategies**: Fine-tune your prompting strategies to improve accuracy and efficiency.
- **Integrate with Production Pipelines**: Incorporate your custom classifiers into production workflows to enhance real-world applications.

For more advanced usage and customization, refer to the [promptfoo documentation](https://promptfoo.dev/docs) and explore additional providers and configurations.
