---
sidebar_label: 'Claude 3.5 Sonnet vs GPT-4o'
description: 'Learn how to benchmark Claude 3.5 Sonnet against GPT-4o using your own data with promptfoo. Discover which model performs best for your specific use case.'
---

# Benchmarking Claude 3.5 Sonnet vs GPT-4o on Your Custom Data

Generic benchmarks often fall short when evaluating Large Language Models (LLMs) like Claude and GPT. To truly understand which model excels for your specific needs, it's crucial to test them on tasks relevant to your use case. This guide walks you through setting up a custom comparison between Anthropic's Claude 3.5 Sonnet and OpenAI's GPT-4o using `promptfoo`.

![Claude 3.5 Sonnet vs GPT-4o comparison](/img/docs/claude3.5-sonnet-vs-gpt4o.png)

## Prerequisites

Before starting, ensure you have:

- `promptfoo` CLI installed ([installation guide](/docs/getting-started))
- API keys for Anthropic (`ANTHROPIC_API_KEY`) and OpenAI (`OPENAI_API_KEY`)

## Step 1: Set Up Your Evaluation

1. Create a new project directory:

```sh
npx promptfoo@latest init claude3.5-vs-gpt4o
cd claude3.5-vs-gpt4o
```

2. Open `promptfooconfig.yaml` and configure the models:

```yaml
providers:
  - id: anthropic:claude-3.5-sonnet
    config:
      temperature: 0.3
      max_tokens: 1024
  - id: openai:gpt-4o
    config:
      temperature: 0.3
      max_tokens: 1024
```

3. Define your prompts:

```yaml
prompts:
  - file://prompt.yaml
```

Create `prompt.yaml`:

```yaml
- role: system
  content: 'You are a careful riddle solver. Be concise.'
- role: user
  content: |
    Answer this riddle:
    {{riddle}}
```

## Step 2: Create Test Cases

Design test cases that represent your application's needs:

```yaml
tests:
  - vars:
      riddle: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?'
    assert:
      - type: icontains
        value: echo
  - vars:
      riddle: "You see a boat filled with people. It has not sunk, but when you look again you don't see a single person on the boat. Why?"
    assert:
      - type: llm-rubric
        value: explains that the people are below deck or they are all in a relationship
  - vars:
      riddle: 'The more of this there is, the less you see. What is it?'
    assert:
      - type: icontains
        value: darkness

defaultTest:
  assert:
    - type: cost
      threshold: 0.01
    - type: latency
      threshold: 3000
    - type: javascript
      value: 'output.length <= 100 ? 1 : output.length > 1000 ? 0 : 1 - (output.length - 100) / 900'
```

## Step 3: Run the Evaluation

Execute the evaluation:

```sh
npx promptfoo@latest eval
```

View the results:

```sh
npx promptfoo@latest view
```

![Claude 3.5 Sonnet vs GPT-4o comparison expanded](/img/docs/claude3.5-sonnet-vs-gpt4o-expanded.png)

Export raw results:

```sh
npx promptfoo@latest eval -o results.json
```

## Step 4: Analyze the Results

Examine the comparison results, focusing on:

- Overall pass rates for test assertions
- Performance differences in specific test cases
- Output quality metrics
- Speed and cost considerations

### Example Observations

- GPT-4o responses tend to be more concise
- GPT-4o is approximately 5x faster
- GPT-4o is about 8x more cost-effective

![Claude latency assertions](/img/docs/claude3.5-sonnet-vs-gpt4o-latency.png)

Detailed test case results:

![Claude test details](/img/docs/claude3.5-result-details.png)

## Conclusion

By conducting targeted evaluations, you gain valuable insights into how Claude 3.5 Sonnet and GPT-4o perform on your application's real-world tasks. `promptfoo` enables you to establish a repeatable evaluation pipeline, allowing you to:

1. Test models as they evolve
2. Measure the impact of model and prompt changes
3. Choose the best foundation model for your use case based on empirical data

To dive deeper into `promptfoo`, explore our [getting started guide](/docs/getting-started) and [configuration reference](/docs/configuration/guide).

## Additional Resources

[PLACEHOLDER: Add links to related documentation, tutorials, or external resources]
