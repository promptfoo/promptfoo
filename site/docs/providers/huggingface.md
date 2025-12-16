---
sidebar_label: HuggingFace
description: Configure HuggingFace's text classification, embedding, and NER models for LLM testing and eval tasks
---

# HuggingFace

Promptfoo includes support for the [HuggingFace Inference Providers](https://huggingface.co/docs/inference-providers), for classification, embeddings, and other ML tasks, as well as [HuggingFace Datasets](https://huggingface.co/docs/datasets).

To run a model, specify the task type and model name. Supported task types include:

- `huggingface:text-classification:<model name>`
- `huggingface:token-classification:<model name>`
- `huggingface:feature-extraction:<model name>`
- `huggingface:sentence-similarity:<model name>`
- `huggingface:text-generation:<model name>`

:::note

The HuggingFace serverless inference API (`hf-inference`) focuses primarily on CPU inference tasks like text classification, embeddings, and NER. For LLM text generation, consider using [Inference Endpoints](#inference-endpoints) or other providers like [Together AI](/docs/providers/togetherai), [Groq](/docs/providers/groq), or [OpenRouter](/docs/providers/openrouter) which offer HuggingFace models.

Browse available models at [huggingface.co/models?inference_provider=hf-inference](https://huggingface.co/models?inference_provider=hf-inference).

:::

## Examples

Text classification for sentiment analysis:

```text
huggingface:text-classification:cardiffnlp/twitter-roberta-base-sentiment-latest
```

Prompt injection detection:

```text
huggingface:text-classification:protectai/deberta-v3-base-prompt-injection
```

Named entity recognition:

```text
huggingface:token-classification:dslim/bert-base-NER
```

Embeddings with sentence-transformers:

```yaml
# Sentence similarity
huggingface:sentence-similarity:sentence-transformers/all-MiniLM-L6-v2

# Feature extraction for embeddings
huggingface:feature-extraction:BAAI/bge-small-en-v1.5
```

## Configuration

These common HuggingFace config parameters are supported:

| Parameter              | Type    | Description                                                                                                     |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `top_k`                | number  | Controls diversity via the top-k sampling strategy.                                                             |
| `top_p`                | number  | Controls diversity via nucleus sampling.                                                                        |
| `temperature`          | number  | Controls randomness in generation.                                                                              |
| `repetition_penalty`   | number  | Penalty for repetition.                                                                                         |
| `max_new_tokens`       | number  | The maximum number of new tokens to generate.                                                                   |
| `max_time`             | number  | The maximum time in seconds model has to respond.                                                               |
| `return_full_text`     | boolean | Whether to return the full text or just new text.                                                               |
| `num_return_sequences` | number  | The number of sequences to return.                                                                              |
| `do_sample`            | boolean | Whether to sample the output.                                                                                   |
| `use_cache`            | boolean | Whether to use caching.                                                                                         |
| `wait_for_model`       | boolean | Whether to wait for the model to be ready. This is useful to work around the "model is currently loading" error |

Additionally, any other keys on the `config` object are passed through directly to HuggingFace. Be sure to check the specific parameters supported by the model you're using.

The provider also supports these built-in promptfoo parameters:

| Parameter     | Type   | Description                        |
| ------------- | ------ | ---------------------------------- |
| `apiKey`      | string | Your HuggingFace API key.          |
| `apiEndpoint` | string | Custom API endpoint for the model. |

Supported environment variables:

- `HF_TOKEN` - your HuggingFace API token (recommended)
- `HF_API_TOKEN` - alternative name for your HuggingFace API token

The provider can pass through configuration parameters to the API. See [HuggingFace Inference API documentation](https://huggingface.co/docs/api-inference/tasks/overview) for task-specific parameters.

Here's an example of how this provider might appear in your promptfoo config:

```yaml
providers:
  - id: huggingface:text-classification:cardiffnlp/twitter-roberta-base-sentiment-latest
```

Using as an assertion for prompt injection detection:

```yaml
tests:
  - vars:
      input: 'Hello, how are you?'
    assert:
      - type: classifier
        provider: huggingface:text-classification:protectai/deberta-v3-base-prompt-injection
        value: SAFE
        threshold: 0.9
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

## Authentication

If you need to access private datasets or want to increase your rate limits, you can authenticate using your HuggingFace token. Set the `HF_TOKEN` environment variable with your token:

```bash
export HF_TOKEN=your_token_here
```

## Datasets

Promptfoo can import test cases directly from HuggingFace datasets. See [Loading Test Cases from HuggingFace Datasets](/docs/configuration/huggingface-datasets) for examples and query parameter details.
