---
sidebar_label: DeepSeek Benchmark
description: Compare DeepSeek V3.2 vs GPT-5 vs Llama 4 Maverick performance with custom benchmarks to evaluate code tasks and choose the optimal model for your needs
---

# DeepSeek vs GPT vs O3 vs Llama: Run a Custom Benchmark

DeepSeek is a model family known for strong reasoning and coding performance.

When evaluating LLMs for your application, generic benchmarks often fall short of capturing the specific requirements of your use case. This guide will walk you through creating a tailored benchmark to compare DeepSeek V3.2, OpenAI's GPT-5 and o3-mini, and Llama 4 Maverick for your specific needs.

In this guide, we'll create a practical comparison that results in a detailed side-by-side analysis view.

## Requirements

- Node.js 20+
- OpenRouter API access for DeepSeek and Llama (set `OPENROUTER_API_KEY`)
- OpenAI API access for GPT-5 and o3-mini (set `OPENAI_API_KEY`)

## Step 1: Project Setup

Create a new directory with a `promptfooconfig.yaml` file:

```sh
mkdir deepseek-benchmark
cd deepseek-benchmark
```

## Step 2: Model Configuration

Edit your `promptfooconfig.yaml` to include the four models:

```yaml title="promptfooconfig.yaml"
providers:
  - 'openai:gpt-5'
  - 'openai:o3-mini'
  - 'openrouter:meta-llama/llama-4-maverick'
  - 'openrouter:deepseek/deepseek-v3.2'

# Optional: Configure model parameters
providers:
  - id: openai:gpt-5
    config:
      temperature: 0.7
      max_tokens: 1000
  - id: openai:o3-mini
    config:
      max_tokens: 1000
  - id: openrouter:meta-llama/llama-4-maverick
    config:
      temperature: 0.7
      max_tokens: 1000
  - id: openrouter:deepseek/deepseek-v3.2
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

| Model            | Architecture | Parameters | Key Strengths                              |
| ---------------- | ------------ | ---------- | ------------------------------------------ |
| DeepSeek-V3.2    | Sparse/MoE   | Unknown    | Strong reasoning, tool use, and code tasks |
| GPT-5            | Unknown      | Unknown    | Consistent performance across tasks        |
| o3-mini          | Unknown      | Unknown    | Reasoning and code tasks                   |
| Llama 4 Maverick | MoE          | Unknown    | Strong open-weight general model           |

However, your custom benchmark results may differ significantly based on your specific use case.

## Considerations for Model Selection

When choosing between these models, consider:

1. **Task Specificity**: DeepSeek excels in mathematical and coding tasks
2. **Resource Requirements**: DeepSeek V3.2 is more resource-intensive than smaller open models, for example.
3. **API Availability**: Factor in API reliability and geographic availability, given that GPT is a proprietary model that requires internet access.
4. **Cost Structure**: Model pricing will vary by providers, and providers are constantly driving down costs.

## Conclusion

While public benchmarks show DeepSeek V3.2 performing strongly in reasoning-heavy tasks, GPT-5 maintaining strong general performance, o3 with strong reasoning performance, and Llama 4 Maverick offering a balanced open-weight option, your specific use case may yield different results.

Remember that the best model for your application depends on your specific requirements, constraints, and use cases. Use this guide as a starting point to create a benchmark that truly matters for your application.
