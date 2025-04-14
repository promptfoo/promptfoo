---
sidebar_label: GPT 3.5 vs GPT 4
---

# GPT 3.5 vs GPT 4: benchmark on your own data

This guide will walk you through how to compare OpenAI's GPT-3.5 and GPT-4 using promptfoo. This testing framework will give you the chance to test the models' reasoning capabilities, cost, and latency.

Generic benchmarks are for generic use cases. If you're building an LLM app, you should evaluate these models on your own data and make an informed decision based on your specific needs.

The end result will be a side-by-side comparison that looks like this:

![gpt 3.5 vs gpt 4](/img/docs/gpt-3.5-vs-gpt-4.png)

## Prerequisites

Before we dive in, ensure you have the following ready:

- promptfoo CLI installed. If not, refer to the [installation guide](/docs/installation).
- An active OpenAI API key set as the `OPENAI_API_KEY` environment variable. See [OpenAI configuration](/docs/providers/openai) for details.

## Step 1: Setup

Create a dedicated directory for your comparison project:

```sh
npx promptfoo@latest init gpt-comparison
```

Edit `promptfooconfig.yaml` to include GPT-3.5 and GPT-4:

```yaml title=promptfooconfig.yaml
providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o
```

## Step 2: Crafting the prompts

For our comparison, we'll use a simple prompt:

```yaml title=promptfooconfig.yaml
prompts:
  - 'Solve this riddle: {{riddle}}'
```

Feel free to add multiple prompts and tailor to your use case.

## Step 3: Create test cases

Above, we have a `{{riddle}}` placeholder variable. Each test case runs the prompts with a different riddle:

```yaml title=promptfooconfig.yaml
tests:
  - vars:
      riddle: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?'
  - vars:
      riddle: 'You see a boat filled with people. It has not sunk, but when you look again you don’t see a single person on the boat. Why?'
  - vars:
      riddle: 'The more of this there is, the less you see. What is it?'
```

## Step 4: Run the comparison

Execute the comparison with the following command:

```
npx promptfoo@latest eval
```

This will process the riddles against both GPT-3.5 and GPT-4, providing you with side-by-side results in your command line interface:

```sh
npx promptfoo@latest view
```

## Step 5: Automatic evaluation

To streamline the evaluation process, you can add various types of assertions to your test cases. Assertions verify if the model's output meets certain criteria, marking the test as pass or fail accordingly:

```yaml
tests:
  - vars:
      riddle: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?'
    assert:
      # Make sure the LLM output contains this word
      - type: contains
        value: echo
      # Inference should always cost less than this (USD)
      - type: cost
        threshold: 0.001
      # Inference should always be faster than this (milliseconds)
      - type: latency
        threshold: 5000
      # Use model-graded assertions to enforce free-form instructions
      - type: llm-rubric
        value: Do not apologize
  - vars:
      riddle: 'You see a boat filled with people. It has not sunk, but when you look again you don’t see a single person on the boat. Why?'
    assert:
      - type: cost
        threshold: 0.002
      - type: latency
        threshold: 3000
      - type: llm-rubric
        value: explains that the people are below deck
  - vars:
      riddle: 'The more of this there is, the less you see. What is it?'
    assert:
      - type: contains
        value: darkness
      - type: cost
        threshold: 0.0015
      - type: latency
        threshold: 4000
```

After setting up your assertions, rerun the `promptfoo eval` command. This automated process helps quickly determine which model best fits your reasoning task requirements.

For more info on available assertion types, see [assertions & metrics](/docs/configuration/expected-outputs/).

### Cleanup

Finally, we'll use `defaultTest` to clean things up a bit and apply global `latency` and `cost` requirements. Here's the final eval config:

```yaml
providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o

prompts:
  - 'Solve this riddle: {{riddle}}'

// highlight-start
defaultTest:
  assert:
    # Inference should always cost less than this (USD)
    - type: cost
      threshold: 0.001
    # Inference should always be faster than this (milliseconds)
    - type: latency
      threshold: 3000
// highlight-end

tests:
  - vars:
      riddle: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?"
    assert:
      - type: contains
        value: echo
  - vars:
      riddle: "You see a boat filled with people. It has not sunk, but when you look again you don’t see a single person on the boat. Why?"
    assert:
      - type: llm-rubric
        value: explains that the people are below deck
  - vars:
      riddle: "The more of this there is, the less you see. What is it?"
    assert:
      - type: contains
        value: darkness
```

For more info on setting up the config, see the [configuration guide](/docs/configuration/guide).

## Conclusion

In the end, you will see a result like this:

![gpt 3.5 vs gpt 4](/img/docs/gpt-3.5-vs-gpt-4.png)

In this particular eval, it looks like GPT-3.5 got all the riddles correct except for one (it misinterprets the meaning of "single"!). But, GPT-4 failed to meet our cost requirements so it scored lower overall.

The tradeoff between cost, latency, and accuracy is going to be tailored for each application. That's why it's important to run your own eval.

I encourage you to experiment with your own test cases and use this guide as a starting point. To learn more, see [Getting Started](/docs/getting-started).
