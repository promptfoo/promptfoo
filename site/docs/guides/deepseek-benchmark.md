---
sidebar_label: Deepseek benchmark
---

# Deepseek vs GPT vs O3 vs Llama: Run a Custom Benchmark

Deepseek is a new Mixture-of-Experts (MoE) model that's all the rage due to its impressive performance, especially in code tasks. Its MoE architecture has 671B total parameters, though only 37B are activated for each token. This allows for efficient inference while maintaining powerful capabilities.

When evaluating LLMs for your application, generic benchmarks often fall short of capturing the specific requirements of your use case. This guide will walk you through creating a tailored benchmark to compare Deepseek-V3, OpenAI's gpt-4o and o3-mini, and Llama-3-70B for your specific needs.

In this guide, we'll create a practical comparison that results in a detailed side-by-side analysis view.

## Requirements

- Node.js 18 or later
- OpenRouter API access for Deepseek and Llama (set `OPENROUTER_API_KEY`)
- OpenAI API access for GPT-4o and o3-mini (set `OPENAI_API_KEY`)

## Step 1: Project Setup

Create a new directory and initialize your benchmark project:

```sh
npx promptfoo@latest init --no-interactive deepseek-benchmark
```

## Step 2: Model Configuration

Edit your `promptfooconfig.yaml` to include the three models:

```yaml title=promptfooconfig.yaml
providers:
  - 'openai:gpt-4o'
  - 'openai:o3-mini'
  - 'openrouter:meta-llama/llama-3-70b-instruct'
  - 'openrouter:deepseek/deepseek-chat'

# Optional: Configure model parameters
providers:
  - id: openai:gpt-4o
    config:
      temperature: 0.7
      max_tokens: 1000
  - id: openai:o3-mini
    config:
      max_tokens: 1000
  - id: openrouter:meta-llama/llama-3-70b-instruct
    config:
      temperature: 0.7
      max_tokens: 1000
  - id: openrouter:deepseek/deepseek-chat
    config:
      max_tokens: 1000
```

Don't forget to set your API keys:

```sh
export OPENROUTER_API_KEY=your_openrouter_api_key
export OPENAI_API_KEY=your_openai_api_key
```

## Step 3: Design Your Test Cases

Let's create a comprehensive test suite that evaluates the models across different dimensions:

```yaml
tests:
  # Complex reasoning tasks
  - vars:
      input: 'What are the implications of quantum computing on current cryptography systems?'
    assert:
      - type: llm-rubric
        value: 'Response should discuss both the threats to current encryption and potential solutions'

  # Code generation
  - vars:
      input: 'Write a Python function to implement merge sort'
    assert:
      - type: contains
        value: 'def merge_sort'

  # Mathematical problem solving
  - vars:
      input: 'Solve this calculus problem: Find the derivative of f(x) = x^3 * ln(x)'
    assert:
      - type: llm-rubric
        value: 'Response should show clear mathematical steps, use proper calculus notation, and arrive at the correct answer: 3x^2*ln(x) + x^2'
      - type: contains
        value: 'derivative'
      - type: contains
        value: 'product rule'

  # Structured output
  - vars:
      input: 'Output a JSON object with the following fields: name, age, and email'
    assert:
      - type: is-json
        value:
          required:
            - name
            - age
            - email
          type: object
          properties:
            name:
              type: string
            age:
              type: number
              minimum: 0
              maximum: 150
            email:
              type: string
              format: email
```

## Step 4: Run Your Evaluation

Execute the benchmark:

```sh
npx promptfoo@latest eval
```

View the results in an interactive interface:

```sh
npx promptfoo@latest view
```

## Model Comparison

Here's how these models compare based on public benchmarks:

| Model       | Architecture | Parameters        | Key Strengths                             |
| ----------- | ------------ | ----------------- | ----------------------------------------- |
| Deepseek-V3 | MoE          | 671B (37B active) | Strong performance in math and code tasks |
| GPT-4o      | Unknown      | Unknown           | Consistent performance across tasks       |
| o3-mini     | Unknown      | Unknown           | Reasoning and code tasks                  |
| Llama-3-70B | Dense        | 70B               | Good balance of efficiency and capability |

However, your custom benchmark results may differ significantly based on your specific use case.

## Considerations for Model Selection

When choosing between these models, consider:

1. **Task Specificity**: Deepseek excels in mathematical and coding tasks
2. **Resource Requirements**: Deepseek is more resource-intensive than Llama 3, for example.
3. **API Availability**: Factor in API reliability and geographic availability, given that GPT is a proprietary model that requires internet access.
4. **Cost Structure**: Model pricing will vary by providers, and providers are constantly driving down costs.

## Conclusion

While public benchmarks show Deepseek performing exceptionally well in certain logical tasks, GPT-4o maintaining strong general performance, o3 with strong reasoning performance, and Llama-3-70B offering a balanced open-source approach, your specific use case may yield different results.

Remember that the best model for your application depends on your specific requirements, constraints, and use cases. Use this guide as a starting point to create a benchmark that truly matters for your application.
