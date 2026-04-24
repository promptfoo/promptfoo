---
sidebar_label: 'Comparing open-source models'
description: 'Compare DeepSeek, Mistral, Qwen, and Llama performance on your custom datasets using automated benchmarks to select the best open-source model for your use case'
---

# Comparing Open-Source Models: Benchmark on Your Own Data

When it comes to building LLM apps, there is no one-size-fits-all benchmark. To maximize the quality of your LLM application, consider building your own benchmark to supplement public benchmarks.

This guide describes how to compare current open-source models like DeepSeek, Mistral, Qwen, and Llama using the `promptfoo` CLI. You can mix and match any combination of these models — just include the providers you want to test.

The end result is a view that compares the performance of your chosen models side-by-side:

![mistral, mixtral, and llama comparison](/img/docs/mistral-vs-mixtral-vs-llama.jpg)

## Requirements

This guide assumes that you have promptfoo [installed](/docs/installation). It uses OpenRouter for convenience, but you can follow these instructions for any provider.

## Set up the config

Initialize a new directory that will contain our prompts and test cases:

```sh
npx promptfoo@latest init --example compare-open-source-models
```

Now let's start editing `promptfooconfig.yaml`. Create a list of models we'd like to compare:

```yaml title="promptfooconfig.yaml"
providers:
  - openrouter:deepseek/deepseek-v3.2
  - openrouter:mistralai/mistral-small-3.2-24b-instruct
  - openrouter:meta-llama/llama-4-maverick
  - openrouter:qwen/qwen3-32b
```

We're using OpenRouter for convenience because it wraps everything in an OpenAI-compatible chat format, but you can use any [provider](/docs/providers) that supplies these models, including HuggingFace, Replicate, Groq, and more.

:::tip
If you prefer to run against locally hosted versions of these models, this can be done via [Ollama](/docs/providers/ollama), [LocalAI](/docs/providers/localai), or [Llama.cpp](/docs/providers/llama.cpp). See [Running Locally with Ollama](#running-locally-with-ollama) below.
:::

## Set up the prompts

Setting up prompts is straightforward. Just include one or more prompts with any `{{variables}}` you like:

```yaml
prompts:
  - 'Respond to this user input: {{message}}'
```

You should modify this prompt to match the use case you want to test. For example:

```yaml
prompts:
  - 'Summarize this article: {{article}}'
  - 'Generate a technical explanation for {{concept}}'
```

<details>

<summary>Advanced: Click here to see how to format prompts differently for each model</summary>

If you're using OpenRouter, you can skip model-specific prompt templates because OpenRouter normalizes requests into an OpenAI-compatible chat format.

If you switch to raw model endpoints on another provider, prompt formatting may differ by model family. In that setup:

- keep one prompt template per family
- assign templates to providers with labels
- confirm the expected chat format in the model card or provider runtime docs

:::tip
If you do use external prompt files, they are [Nunjucks templates](https://mozilla.github.io/nunjucks/), so you can use if statements, for loops, and filters for more complex prompts.
:::

</details>

## Configure model parameters

Each model has a `config` field where you can specify additional parameters. Let's add `temperature` for each model:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openrouter:deepseek/deepseek-v3.2
    config:
      temperature: 0.5
  - id: openrouter:mistralai/mistral-small-3.2-24b-instruct
    config:
      temperature: 0.5
  - id: openrouter:meta-llama/llama-4-maverick
    config:
      temperature: 0.5
  - id: openrouter:qwen/qwen3-32b
    config:
      temperature: 0.5
```

These settings will apply to all test cases run against these models.

## Set environment variables

To configure the OpenRouter provider, be sure to set the environment variable:

```sh
OPENROUTER_API_KEY=your_openrouter_api_key
```

## Add test cases

The `tests` field in the `promptfooconfig.yaml` file is where you add your test cases. Each test case is a dictionary with the `vars` field containing the variables to be interpolated into the prompts.

Here are the test cases we will use:

```yaml title="promptfooconfig.yaml"
# ...
tests:
  - vars:
      message: hello world
  - vars:
      message: tell me about yourself
  - vars:
      message: What's the weather in New York right now?
  - vars:
      message: are hippos good swimmers?
  - vars:
      message: Did Henry VIII have any grandchildren?
  - vars:
      message: Would a cannibal cult be harmful to society?
  - vars:
      message: Please write a function in JavaScript that takes in a string as input and returns true if it contains a valid roman numeral and false otherwise.
  - vars:
      message: what are the most common non-investor roles at early stage venture capital firms?
```

### Check for correctness

Let's set up a few assertions to automatically assess the output for correctness:

```yaml title="promptfooconfig.yaml"
# ...
tests:
  - vars:
      message: hello world
  - vars:
      message: tell me about yourself
  - vars:
      message: What's the weather in New York right now?
    assert:
      - type: llm-rubric
        value: does not claim to know the current weather in new york
  - vars:
      message: are hippos good swimmers?
    assert:
      - type: llm-rubric
        value: says that hippos are NOT good swimmers
  - vars:
      message: Did Henry VIII have any grandchildren?
    assert:
      - type: llm-rubric
        value: says that Henry VIII doesn't have grandchildren
  - vars:
      message: Would a cannibal cult be harmful to society?
    assert:
      - type: llm-rubric
        value: unequivocally says that a cannibal cult is harmful to society
  - vars:
      message: Please write a function in JavaScript that takes in a string as input and returns true if it contains a valid roman numeral and false otherwise.
  - vars:
      message: what are the most common non-investor roles at early stage venture capital firms?
```

:::info
Learn more about setting up test assertions [here](/docs/configuration/expected-outputs).
:::

## Run the comparison

Once your config file is set up, you can run the comparison using the `promptfoo eval` command:

```
npx promptfoo@latest eval
```

This will run each of the test cases against each of the models and output the results.

Then, to open the web viewer, run `npx promptfoo@latest view`.

![mistral, mixtral, and llama comparison](/img/docs/mistral-vs-mixtral-vs-llama.jpg)

You can also output a JSON, YAML, or CSV by specifying an output file:

```
npx promptfoo@latest eval -o output.csv
```

## Analyzing the results

After running the evaluation, look for patterns in the results:

- Which model is more accurate or relevant in its responses?
- Are there noticeable differences in how they handle certain types of questions?
- Consider the implications of these results for your specific application or use case.

Common differences worth tracking:

- which model refuses unsupported real-time or unverifiable claims
- which model is most concise versus most verbose
- how often each model follows formatting instructions without drift
- whether code and reasoning tasks trade off against conversational quality

## Running Locally with Ollama

If you prefer to run models locally, you can use [Ollama](/docs/providers/ollama) instead of OpenRouter. Just swap the providers:

```yaml title="promptfooconfig.yaml"
providers:
  - id: ollama:chat:mistral
    config:
      temperature: 0.01
      num_predict: 128
  - id: ollama:chat:llama4:scout
    config:
      temperature: 0.01
      num_predict: 128
  - id: ollama:chat:gemma2
    config:
      temperature: 0.01
      num_predict: 128
  - id: ollama:chat:phi4
    config:
      temperature: 0.01
      num_predict: 128
```

Make sure you've pulled the models first:

```sh
ollama pull mistral
ollama pull llama4:scout
ollama pull gemma2
ollama pull phi4
```

Everything else in the configuration stays the same.

## Conclusion

Ultimately, if you are considering these LLMs for a specific use case, you should eval them specifically for your use case. Replace the test cases above with representative examples from your specific workload. This will create a much more specific and useful benchmark.

View the [getting started](/docs/getting-started) guide to run your own LLM benchmarks.
