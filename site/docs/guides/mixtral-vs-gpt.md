---
sidebar_label: Mixtral vs GPT
---

# Mixtral vs GPT: Run a benchmark with your own data

In this guide, we'll walk through the steps to compare three large language models (LLMs): Mixtral, GPT-4o-mini, and GPT-4o. We will use `promptfoo`, a command-line interface (CLI) tool, to run evaluations and compare the performance of these models based on a set of prompts and test cases.

![mixtral and gpt comparison](/img/docs/mixtral-vs-gpt.png)

## Requirements

- `promptfoo` CLI installed on your system.
- Access to Replicate for Mixtral.
- Access to OpenAI for GPT-4o-mini and GPT-4o.
- API keys for Replicate (`REPLICATE_API_TOKEN`) and OpenAI (`OPENAI_API_KEY`).

## Step 1: Initial Setup

Create a new directory for your comparison project and initialize it with `promptfoo init`.

```sh
npx promptfoo@latest init mixtral-gpt-comparison
```

## Step 2: Configure the models

Edit your `promptfooconfig.yaml` to include the models you want to compare. Here's an example configuration with Mixtral, GPT-4o-mini, and GPT-4o:

```yaml title=promptfooconfig.yaml
providers:
  - replicate:mistralai/mixtral-8x7b-instruct-v0.1:2b56576fcfbe32fa0526897d8385dd3fb3d36ba6fd0dbe033c72886b81ade93e
  - openai:gpt-4o-mini
  - openai:gpt-4o
```

Set your API keys as environment variables:

```sh
export REPLICATE_API_TOKEN=your_replicate_api_token
export OPENAI_API_KEY=your_openai_api_key
```

:::info
In this example, we're using Replicate, but you can also use providers like [HuggingFace](/docs/providers/huggingface), [TogetherAI](/docs/providers/togetherai), etc:

```yaml
- huggingface:text-generation:mistralai/Mistral-7B-Instruct-v0.1
- id: openai:chat:mistralai/Mixtral-8x7B-Instruct-v0.1
  config:
    apiBaseUrl: https://api.together.xyz/v1
```

Local options such as [ollama](/docs/providers/ollama), [vllm](/docs/providers/vllm), and [localai](/docs/providers/localai) also exist. See [providers](/docs/providers) for all options.
:::

### Optional: Configure model parameters

Customize the behavior of each model by setting parameters such as `temperature` and `max_tokens` or `max_length`:

```yaml title=promptfooconfig.yaml
providers:
  - id: openai:gpt-4o-mini
    // highlight-start
    config:
      temperature: 0
      max_tokens: 128
    // highlight-end
  - id: openai:gpt-4o
    // highlight-start
    config:
      temperature: 0
      max_tokens: 128
    // highlight-end
  - id: replicate:mistralai/mixtral-8x7b-instruct-v0.1:2b56576fcfbe32fa0526897d8385dd3fb3d36ba6fd0dbe033c72886b81ade93e
    // highlight-start
    config:
      temperature: 0.01
      max_new_tokens: 128
    // highlight-end
```

## Step 3: Set up your prompts

Set up the prompts that you want to run for each model. In this case, we'll just use a simple prompt, because we want to compare model performance.

```yaml title=promptfooconfig.yaml
prompts:
  - 'Answer this as best you can: {{query}}'
```

If desired, you can test multiple prompts (just add more to the list), or test [different prompts for each model](/docs/configuration/parameters#different-prompts-per-model).

## Step 4: Add test cases

Define the test cases that you want to use for the evaluation. This includes setting up variables that will be interpolated into the prompts:

```yaml title=promptfooconfig.yaml
tests:
  - vars:
      query: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
  - vars:
      query: 'Explain the theory of relativity.'
    assert:
      - type: contains
        value: 'Einstein'
  - vars:
      query: 'Write a poem about the sea.'
    assert:
      - type: llm-rubric
        value: 'The poem should evoke imagery such as waves or the ocean.'
  - vars:
      query: 'What are the health benefits of eating apples?'
    assert:
      - type: contains
        value: 'vitamin'
  - vars:
      query: "Translate 'Hello, how are you?' into Spanish."
    assert:
      - type: similar
        value: 'Hola, ¿cómo estás?'
  - vars:
      query: 'Output a JSON list of colors'
    assert:
      - type: is-json
      - type: latency
        threshold: 5000
```

Optionally, you can set up assertions to automatically assess the output for correctness.

## Step 5: Run the comparison

With everything configured, run the evaluation using the `promptfoo` CLI:

```
npx promptfoo@latest eval
```

This command will execute each test case against each configured model and record the results.

To visualize the results, use the `promptfoo` viewer:

```sh
npx promptfoo@latest view
```

It will show results like so:

![mixtral and gpt comparison](/img/docs/mixtral-vs-gpt.png)

You can also output the results to a file in various formats, such as JSON, YAML, or CSV:

```
npx promptfoo@latest eval -o results.csv
```

## Conclusion

The comparison will provide you with a side-by-side performance view of Mixtral, GPT-4o-mini, and GPT-4o based on your test cases. Use this data to make informed decisions about which LLM best suits your application.

Contrast this with public benchmarks from the [Chatbot Arena](https://lmarena.ai/) leaderboard:

| Model                      | Arena rating | MT-bench score |
| -------------------------- | ------------ | -------------- |
| gpt-4o                     | 1243         | 9.32           |
| Mixtral-8x7b-Instruct-v0.1 | 1121         | 8.3            |
| gpt-4o-mini                | 1074         | 8.32           |

While public benchmarks tell you how these models perform on _generic_ tasks, they are no substitute for running a benchmark on your _own_ data and use cases.

The examples above highlighted a few cases where GPT outperforms Mixtral: notably, GPT-4 was better at following JSON output instructions. But, GPT 3.5 had the highest eval score because of the latency requirements that we added to one of the test cases. Overall, the best choice is going to depend largely on the test cases that you construct and your own application constraints.
