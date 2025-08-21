---
sidebar_position: 23
sidebar_label: HuggingFace Datasets
title: Loading Test Cases from HuggingFace Datasets
description: Load HuggingFace datasets directly for LLM evaluation with automatic splits, filtering, and format conversion capabilities
keywords:
  [
    huggingface datasets,
    test cases,
    dataset integration,
    promptfoo datasets,
    ml evaluation,
    dataset import,
    existing datasets,
  ]
pagination_prev: configuration/datasets
pagination_next: configuration/outputs
---

# HuggingFace Datasets

Promptfoo can import test cases directly from [HuggingFace datasets](https://huggingface.co/docs/datasets) using the `huggingface://datasets/` prefix.

## Basic usage

To load an entire dataset:

```yaml
tests: huggingface://datasets/fka/awesome-chatgpt-prompts
```

Run the evaluation:

```bash
npx promptfoo eval
```

Each dataset row becomes a test case with all dataset fields available as variables.

## Dataset splits

Load specific portions of datasets using query parameters:

```yaml
# Load from training split
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=train

# Load from validation split with custom configuration
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=validation&config=custom
```

## Use dataset fields in prompts

Dataset fields automatically become prompt variables. Here's how:

```yaml title="promptfooconfig.yaml"
prompts:
  - "Question: {{question}}\nAnswer:"

tests: huggingface://datasets/rajpurkar/squad
```

## Query parameters

| Parameter | Description                                   | Default     |
| --------- | --------------------------------------------- | ----------- |
| `split`   | Dataset split to load (train/test/validation) | `test`      |
| `config`  | Dataset configuration name                    | `default`   |
| `subset`  | Dataset subset (for multi-subset datasets)    | `none`      |
| `limit`   | Maximum number of test cases to load          | `unlimited` |

The loader accepts any parameter supported by the [HuggingFace Datasets API](https://huggingface.co/docs/datasets-server/api_reference#get-apirows). Additional parameters beyond these common ones are passed directly to the API.

To limit the number of test cases:

```yaml
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=train&limit=50
```

To load a specific subset (common with MMLU datasets):

```yaml
tests: huggingface://datasets/cais/mmlu?split=test&subset=physics&limit=10
```

## Authentication

For private datasets or increased rate limits, authenticate using your HuggingFace token. Set one of these environment variables:

```bash
# Any of these environment variables will work:
export HF_TOKEN=your_token_here
export HF_API_TOKEN=your_token_here
export HUGGING_FACE_HUB_TOKEN=your_token_here
```

:::info
Authentication is required for private datasets and gated models. For public datasets, authentication is optional but provides higher rate limits.
:::

## Implementation details

- Each dataset row becomes a test case
- All dataset fields are available as prompt variables
- Large datasets are automatically paginated (100 rows per request)
- Variable expansion is disabled to preserve original data

## Example configurations

### Basic chatbot evaluation

```yaml title="promptfooconfig.yaml"
description: Testing with HuggingFace dataset

prompts:
  - 'Act as {{act}}. {{prompt}}'

providers:
  - openai:gpt-4.1-mini

tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=train
```

### Question answering with limits

```yaml title="promptfooconfig.yaml"
description: SQUAD evaluation with authentication

prompts:
  - 'Question: {{question}}\nContext: {{context}}\nAnswer:'

providers:
  - openai:gpt-4.1-mini

tests: huggingface://datasets/rajpurkar/squad?split=validation&limit=100

env:
  HF_TOKEN: your_token_here
```

## Example projects

| Example                                                                                                    | Use Case          | Key Features         |
| ---------------------------------------------------------------------------------------------------------- | ----------------- | -------------------- |
| [Basic Setup](https://github.com/promptfoo/promptfoo/tree/main/examples/huggingface-dataset)               | Simple evaluation | Default parameters   |
| [MMLU Comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-gpt-4.1-vs-gpt-4o-mmlu) | Query parameters  | Split, subset, limit |
| [Red Team Safety](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-beavertails)           | Safety testing    | BeaverTails dataset  |

## Troubleshooting

### Authentication errors

Ensure your HuggingFace token is set correctly: `export HF_TOKEN=your_token`

### Dataset not found

Verify the dataset path format: `owner/repo` (e.g., `rajpurkar/squad`)

### Empty results

Check that the specified split exists for the dataset. Try `split=train` if `split=test` returns no results.

### Performance issues

Add the `limit` parameter to reduce the number of rows loaded: `&limit=100`

## See Also

- [Test Case Configuration](/docs/configuration/test-cases) - Complete guide to configuring test cases
- [HuggingFace Provider](/docs/providers/huggingface) - Using HuggingFace models for inference
- [CSV Test Cases](/docs/configuration/test-cases#csv-format) - Loading test cases from CSV files
- [Red Team Configuration](/docs/red-team/configuration) - Using datasets in red team evaluations
