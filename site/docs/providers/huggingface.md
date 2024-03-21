---
sidebar_position: 99
---

# HuggingFace

promptfoo includes support for the [HuggingFace Inference API](https://huggingface.co/inference-api), specifically **text generation** and **feature extraction** tasks.

To run a model, specify the task type and model name. Supported models include:

- `huggingface:text-generation:<model name>`
- `huggingface:text-classification:<model name>`
- `huggingface:token-classification:<model name>`
- `huggingface:feature-extraction:<model name>`
- `huggingface:sentence-similarity:<model name>`

## Examples

For example, autocomplete with GPT-2:

```
huggingface:text-generation:gpt2
```

Generate text with Mistral:

```
huggingface:text-generation:mistralai/Mistral-7B-v0.1
```

Embeddings similarity with `sentence-transformers`:

```
# Model supports the sentence similarity API
huggingface:sentence-similarity:sentence-transformers/all-MiniLM-L6-v2

# Model supports the feature extraction API
huggingface:feature-extraction:sentence-transformers/paraphrase-xlm-r-multilingual-v1
```

## Configuration

These common HuggingFace config parameters are supported:

| Parameter              | Type    | Description                                                                                               |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `top_k`                | number  | Controls diversity via the top-k sampling strategy.                                                       |
| `top_p`                | number  | Controls diversity via nucleus sampling.                                                                  |
| `temperature`          | number  | Controls randomness in generation.                                                                        |
| `repetition_penalty`   | number  | Penalty for repetition.                                                                                   |
| `max_new_tokens`       | number  | The maximum number of new tokens to generate.                                                             |
| `max_time`             | number  | The maximum time in seconds model has to respond.                                                         |
| `return_full_text`     | boolean | Whether to return the full text or just new text.                                                         |
| `num_return_sequences` | number  | The number of sequences to return.                                                                        |
| `do_sample`            | boolean | Whether to sample the output.                                                                             |
| `use_cache`            | boolean | Whether to use caching.                                                                                   |
| `wait_for_model`       | boolean | Whether to wait for the model to be ready. This is useful to work around the "model is currently loading" error |

Additionally, any other keys on the `config` object are passed through directly to HuggingFace. Be sure to check the specific parameters supported by the model you're using.

The provider also supports these built-in promptfoo parameters:

| Parameter     | Type   | Description                        |
| ------------- | ------ | ---------------------------------- |
| `apiKey`      | string | Your HuggingFace API key.          |
| `apiEndpoint` | string | Custom API endpoint for the model. |

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

## Inference endpoints

HuggingFace provides the ability to pay for private hosted inference endpoints. First, go the [Create a new Endpoint](https://ui.endpoints.huggingface.co/new) and select a model and hosting setup.

![huggingface inference endpoint creation](/img/docs/huggingface-create-endpoint.png)

Once the endpoint is created, take the `Endpoint URL` shown on the page:

![huggingface inference endpoint url](/img/docs/huggingface-inference-endpoint.png)

Then set up your promptfoo config like this:

```yaml
description: 'HF private inference endpoint'

prompts:
  - 'Write a tweet about {{topic}}:'

providers:
  - id: huggingface:text-generation:gemma-7b-it
    config:
      apiEndpoint: https://v9igsezez4ei3cq4.us-east-1.aws.endpoints.huggingface.cloud
      # apiKey: abc123   # Or set HF_API_TOKEN environment variable

tests:
  - vars:
      topic: bananas
  - vars:
      topic: potatoes
```

## Local inference

If you're running the [Huggingface Text Generation Inference](https://github.com/huggingface/text-generation-inference) server locally, override the `apiEndpoint`:

```yaml
providers:
  - id: huggingface:text-generation:my-local-model
    config:
      apiEndpoint: http://127.0.0.1:8080/generate
```
