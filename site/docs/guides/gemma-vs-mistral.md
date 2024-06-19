---
sidebar_label: Gemma vs Mistral/Mixtral
---

# Gemma vs Mistral: benchmark on your own data

When comparing the performance of LLMs, it's best not to rely on generic benchmarks. This guide shows you how to set up a comprehensive benchmark that compares Gemma vs Mistral vs Mixtral.

The end result is a side-by-side comparison of these models on tasks that matter to you:

![gemma vs mistral vs mixtral](/img/docs/gemma-vs-mistral.png)

## Prerequisites

Ensure you have the following before starting:

- `promptfoo` installed (see [installation](/docs/getting-started))
- A Replicate API key, set as the `REPLICATE_API_KEY` environment variable

While this guide focuses on using Replicate, this method supports many other providers such as [Ollama](/docs/providers/ollama), [OpenRouter](/docs/providers/openrouter), etc.

## Step 1: Configuration setup

Begin by creating a directory for your evaluation:

```sh
npx promptfoo@latest init gemma-vs-mistral
```

`cd gemma-vs-mistral` and open `promptfooconfig.yaml`. This file determines how the benchmark uses Gemma, Mistral, and Mixtral, including response parameters and prompt formats.

### Defining prompts

Your configuration starts with the prompts you'll use for testing. We're just going to use a placeholder for now:

```yaml
prompts:
  - '{{message}}'
```

You should customize these prompts based on your use case. For example:

```yaml
prompts:
  - 'Summarize this article: {{article}}'
  - 'Generate a technical explanation for {{concept}}'
```

### Configuring providers

Next, specify the models you're comparing by setting up their configurations:

#### Mistral Configuration

```yaml
- id: replicate:mistralai/mistral-7b-instruct-v0.2
  config:
    temperature: 0.01
    max_new_tokens: 1024
    prompt:
      prefix: '<s>[INST] '
      suffix: ' [/INST]'
```

#### Mixtral Configuration

```yaml
- id: replicate:mistralai/mixtral-8x7b-instruct-v0.1
  config:
    temperature: 0.01
    max_new_tokens: 1024
    prompt:
      prefix: '<s>[INST] '
      suffix: ' [/INST]'
```

#### Gemma Configuration

```yaml
- id: replicate:google-deepmind/gemma-7b-it:2790a695e5dcae15506138cc4718d1106d0d475e6dca4b1d43f42414647993d5
  config:
    temperature: 0.01
    max_new_tokens: 1024
    prompt:
      prefix: "<start_of_turn>user\n"
      suffix: "<end_of_turn>\n<start_of_turn>model"
```

### Full configuration example

Combine the configurations for a direct comparison:

```yaml
prompts:
  - '{{message}}'

providers:
  - id: replicate:mistralai/mistral-7b-instruct-v0.2
    config:
      temperature: 0.01
      max_new_tokens: 1024
      prompt:
        prefix: '<s>[INST] '
        suffix: ' [/INST]'

  - id: replicate:mistralai/mixtral-8x7b-instruct-v0.1
    config:
      temperature: 0.01
      max_new_tokens: 1024
      prompt:
        prefix: '<s>[INST] '
        suffix: ' [/INST]'

  - id: replicate:google-deepmind/gemma-7b-it:2790a695e5dcae15506138cc4718d1106d0d475e6dca4b1d43f42414647993d5
    config:
      temperature: 0.01
      max_new_tokens: 1024
      prompt:
        prefix: "<start_of_turn>user\n"
        suffix: "<end_of_turn>\n<start_of_turn>model"
```

## Step 2: Build a test set

Design test cases that reflect a variety of requests that are representative of your app's use case.

For this example, we're focusing on riddles to test the models' ability to understand and generate creative and logical responses.

```yaml
tests:
  - vars:
      message: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?'
  - vars:
      message: 'You see a boat filled with people. It has not sunk, but when you look again you don’t see a single person on the boat. Why?'
  - vars:
      message: 'The more of this there is, the less you see. What is it?'
  - vars:
      message: >-
        I have keys but no locks. I have space but no room. You can enter, but
        can’t go outside. What am I?
  - vars:
      message: >-
        I am not alive, but I grow; I don't have lungs, but I need air; I don't
        have a mouth, but water kills me. What am I?
  - vars:
      message: What can travel around the world while staying in a corner?
  - vars:
      message: Forward I am heavy, but backward I am not. What am I?
  - vars:
      message: >-
        The person who makes it, sells it. The person who buys it, never uses
        it. The person who uses it, doesn't know they're using it. What is it?
  - vars:
      message: I can be cracked, made, told, and played. What am I?
  - vars:
      message: What has keys but can't open locks?
  - vars:
      message: >-
        I'm light as a feather, yet the strongest person can't hold me for much
        more than a minute. What am I?
  - vars:
      message: >-
        I can fly without wings, I can cry without eyes. Whenever I go, darkness
        follows me. What am I?
  - vars:
      message: >-
        I am taken from a mine, and shut up in a wooden case, from which I am
        never released, and yet I am used by almost every person. What am I?
  - vars:
      message: >-
        David's father has three sons: Snap, Crackle, and _____? What is the
        name of the third son?
  - vars:
      message: >-
        I am light as a feather, but even the world's strongest man couldn’t
        hold me for much longer than a minute. What am I?
```

Incorporate automated checks with the `assert` property to evaluate outputs systematically:

```yaml
tests:
  - vars:
      message: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?"
    // highlight-start
    assert:
      # Make sure the LLM output contains this word
      - type: icontains
        value: echo
      # Use model-graded assertions to enforce free-form instructions
      - type: llm-rubric
        value: Do not apologize
    // highlight-end
  - vars:
      message: "You see a boat filled with people. It has not sunk, but when you look again you don’t see a single person on the boat. Why?"
    // highlight-start
    assert:
      - type: llm-rubric
        value: explains that the people are below deck
    // highlight-end
  - vars:
      message: "The more of this there is, the less you see. What is it?"
    // highlight-start
    assert:
      - type: icontains
        value: darkness
    // highlight-end
  # ...
```

## Step 3: Running the benchmark

Execute the comparison with:

```
npx promptfoo@latest eval
```

Then, view the results:

```sh
npx promptfoo@latest view
```

This shows a view like this:

![gemma vs mistral vs mixtral](/img/docs/gemma-vs-mistral.png)

## Step 4: Results analysis

Upon completing the evaluation, look at the test results to identify which model performs best across your test cases. You should tailor the test evaluation to your application's needs specifically.

Here's what we noticed from our small riddle test set:

- Gemma passes in 100% of cases, Mixtral in 93%, and Mistral in 73%
- Gemma outperforms Mistral v0.2 and Mixtral v0.1
- Gemma is more likely to answer up-front and not include commentary like "What a delightful riddle!"

![some example gemma and mistral outputs](/img/docs/gemma-vs-mistral-examples.png)

When constructing your own test set, think about edge cases and unusual criteria that are specific to your app and may not be in model training data. Ideally, it's best to set up a feedback loop where real users of your app can flag failure cases. Use this to build your test set over time.

To learn more about setting up promptfoo, see [Getting Started](/docs/getting-started) or our more detailed [Configuration Guide](/docs/configuration/guide).
