---
sidebar_label: 'gpt-4o vs o1'
description: 'Learn how to benchmark OpenAI o1 and o1-mini. Discover which model performs best for your specific use case.'
---

# gpt-4o vs o1: Benchmark on Your Own Data

OpenAI has released a new model series called o1 designed to spend more time thinking before responding and excel at complex reasoning tasks.

While it scores higher on generic benchmarks, there are many real-world cases where gpt-4o is still the better choice.

This guide describes through how to compare `o1-preview` and `o1-mini` against `gpt-4o` using promptfoo, with a focus on performance, cost, and latency.

The end result will be a side-by-side comparison that looks similar to this:

![o1 vs gpt-4o comparison](/img/docs/o1-vs-gpt.png)

## Prerequisites

Before we begin, you'll need:

- promptfoo CLI installed. If not, refer to the [installation guide](/docs/installation).
- An active OpenAI API key set as the `OPENAI_API_KEY` environment variable.

## Step 1: Setup

Create a new directory for your comparison project:

```sh
npx promptfoo@latest init openai-o1-comparison
```

## Step 2: Configure the Comparison

Edit the `promptfooconfig.yaml` file to define your comparison.

1. **Prompts**:
   Define the prompt template that will be used for all test cases. In this example, we're using riddles:

   ```yaml
   prompts:
     - 'Solve this riddle: {{riddle}}'
   ```

   The `{{riddle}}` placeholder will be replaced with specific riddles in each test case.

1. **Providers**:
   Specify the models you want to compare. In this case, we're comparing gpt-4o and o1-preview:

   ```yaml
   providers:
     - openai:gpt-4o
     - openai:o1-preview
   ```

1. **Default Test Assertions**:
   Set up default assertions that will apply to all test cases. Given the cost and speed of o1, we're setting thresholds for cost and latency:

   ```yaml
   defaultTest:
     assert:
       # Inference should always cost less than this (USD)
       - type: cost
         threshold: 0.02
       # Inference should always be faster than this (milliseconds)
       - type: latency
         threshold: 30000
   ```

   These assertions will flag any responses that exceed $0.02 in cost or 30 seconds in response time.

1. **Test Cases**:
   Now, define your test cases. In this specific example, each test case includes:

   - The riddle text (assigned to the `riddle` variable)
   - Specific assertions for that test case (optional)

   Here's an example of a test case with assertions:

   ```yaml
   tests:
     - vars:
         riddle: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?'
       assert:
         - type: contains
           value: echo
         - type: llm-rubric
           value: Do not apologize
   ```

   This test case checks if the response contains the word "echo" and uses an LLM-based rubric to ensure the model doesn't apologize in its response. See [deterministic metrics](/docs/configuration/expected-outputs/deterministic/) and [model-graded metrics](/docs/configuration/expected-outputs/model-graded/) for more details.

   Add multiple test cases to thoroughly evaluate the models' performance on different types of riddles or problems.

Now, let's put it all together in the final configuration:

```yaml title=promptfooconfig.yaml
description: 'GPT 4o vs o1 comparison'
prompts:
  - 'Solve this riddle: {{riddle}}'
providers:
  - openai:gpt-4o
  - openai:o1-preview
defaultTest:
  assert:
    # Inference should always cost less than this (USD)
    - type: cost
      threshold: 0.02
    # Inference should always be faster than this (milliseconds)
    - type: latency
      threshold: 30000
tests:
  - vars:
      riddle: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?'
    assert:
      - type: contains
        value: echo
      - type: llm-rubric
        value: Do not apologize
  - vars:
      riddle: 'The more of this there is, the less you see. What is it?'
    assert:
      - type: contains
        value: darkness
  - vars:
      riddle: >-
        Suppose I have a cabbage, a goat and a lion, and I need to get them across a river. I have a boat that can only carry myself and a single other item. I am not allowed to leave the cabbage and lion alone together, and I am not allowed to leave the lion and goat alone together. How can I safely get all three across?
  - vars:
      riddle: 'The surgeon, who is the boys father says, "I cant operate on this boy, hes my son!" Who is the surgeon to the boy?'
    assert:
      - type: llm-rubric
        value: "output must state that the surgeon is the boy's father"
```

This configuration sets up a comprehensive comparison between gpt-4o and o1-preview using a variety of riddles, with cost and latency requirements. We strongly encourage you to revise this with your own test cases and assertions!

## Step 3: Run the Comparison

Execute the comparison using the `promptfoo eval` command:

```sh
npx promptfoo@latest eval
```

This will run each test case against both models and output the results.

To view the results in a web interface, run:

```sh
npx promptfoo@latest view
```

![o1 vs gpt-4o comparison](/img/docs/o1-vs-gpt.png)

## What's next?

By running this comparison, you'll gain insights into how the o1-class models perform against gpt-4o on tasks requiring logical reasoning and problem-solving. You'll also see the trade-offs in terms of cost and latency.

In this case, gpt-4o outperforms o1 because answering a simple riddle in some cases costs over 4 cents! This limits its viability for production use cases, but we're sure that OpenAI will continue to slash inference costs in the future.

Ultimately, the best model is going to depend a lot on your application. There's no substitute for testing these models on your own data, rather than relying on general-purpose benchmarks.
