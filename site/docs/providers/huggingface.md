---
sidebar_position: 99
---

# HuggingFace

promptfoo includes support for the [HuggingFace Inference API](https://huggingface.co/inference-api), specifically **text generation** and **feature extraction** tasks.

To run a model, specify the task type and model name. Supported models include:

- `huggingface:text-generation:<model name>`
- `huggingface:feature-extraction:<model name>`
- `huggingface:text-classification:<model name>`

For example, autocomplete with GPT-2:

```
huggingface:text-generation:gpt2
```

Generate text with Mistral:

```
huggingface:text-generation:mistralai/Mistral-7B-v0.1
```

Supported environment variables:

- `HF_API_TOKEN` - your HuggingFace API key

The provider can pass through configuration parameters to the API. See [text generation parameters](https://huggingface.co/docs/api-inference/detailed_parameters#text-generation-task) and [feature extraction parameters](https://huggingface.co/docs/api-inference/detailed_parameters#feature-extraction-task).

Here's an example of how this provider might appear in your promptfoo config:

```yaml
providers:
  - id: huggingface:text-generation:mistralai/Mistral-7B-v0.1
    config:
      temperature: 0.1
      max_length: 1024
```

## Local inference

If you're running the [Huggingface Text Generation Inference](https://github.com/huggingface/text-generation-inference) server locally, override the `apiEndpoint`:

```yaml
providers:
  - id: huggingface:text-generation:my-local-model
    config:
      apiEndpoint: http://127.0.0.1:8080/generate
```
