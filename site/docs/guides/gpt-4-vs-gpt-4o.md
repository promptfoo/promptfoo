---
sidebar_label: GPT-4o vs GPT-4o-mini
---

# GPT-4o vs GPT-4o-mini: Benchmark on Your Own Data

OpenAI released [gpt-4o-mini](https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/), a highly cost-efficient small model designed to expand the range of applications built with AI by making intelligence more affordable. GPT-4o mini surpasses GPT-3.5 Turbo in performance and affordability, and while it is more cost-effective than GPT-4o, it maintains strong capabilities in both textual intelligence and multimodal reasoning.

This guide will walk you through how to compare OpenAI's GPT-4o and GPT-4o-mini using promptfoo. This testing framework will give you the chance to test the models' reasoning capabilities, cost, and latency.

Generic benchmarks are for generic use cases. If you're building an LLM app, you should evaluate these models on your own data and make an informed decision based on your specific needs.

The end result will be a side-by-side comparison that looks like this:

![gpt-4o vs gpt-4o-mini](/img/docs/gpt-4o-vs-gpt-4o-mini.png)

## Prerequisites

Before we dive in, ensure you have the following ready:

- promptfoo CLI installed. If not, refer to the [installation guide](/docs/installation).
- An active OpenAI API key set as the `OPENAI_API_KEY` environment variable. See [OpenAI configuration](/docs/providers/openai) for details.

## Step 1: Setup

Create a dedicated directory for your comparison project:

```sh
npx promptfoo@latest init gpt-comparison
```

Edit `promptfooconfig.yaml` to include GPT-4o and GPT-4o-mini:

```yaml title=promptfooconfig.yaml
providers:
  - openai:gpt-4o
  - openai:gpt-4o-mini
```

## Step 2: Crafting the Prompts

In this example, we consider a custom binary image classification task. If you're working on an application that involves classifying images into two categories (e.g., cat vs. dog), you can set up a similar comparison using promptfoo.

First, adjust your `promptfooconfig.yaml` to include the prompts and test cases relevant to your image classification task:

```yaml title=promptfooconfig.yaml
providers:
  - openai:gpt-4o
  - openai:gpt-4o-mini

prompts:
  - |
    role: user
    content:
      - type: text
        text: Please classify this image as a cat or a dog in one word in lower case.
      - type: image_url
        image_url:
          url: "{{url}}"
tests:
  - vars:
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Felis_catus-cat_on_snow.jpg/640px-Felis_catus-cat_on_snow.jpg'
    assert:
      - type: equals
        value: 'cat'
  - vars:
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/American_Eskimo_Dog.jpg/612px-American_Eskimo_Dog.jpg'
    assert:
      - type: equals
        value: 'dog'
```

Run the comparison with the `promptfoo eval` command to see how each model performs on your binary image classification task. While GPT-4o may provide higher accuracy, GPT-4o-mini's lower cost makes it an attractive option for applications where cost-efficiency is crucial.

GPT-4o mini is designed to be cost-efficient and excels in various reasoning tasks, making it an excellent choice for applications requiring affordable and fast responses. It supports text and vision in the API and will soon extend to text, image, video, and audio inputs and outputs, making it versatile for a wide range of use cases.

The tradeoff between cost, latency, and accuracy is going to be tailored for each application. That's why it's important to run your own evaluation.

Experiment with your own test cases and use this guide as a starting point. To learn more, see [Getting Started](/docs/getting-started).
