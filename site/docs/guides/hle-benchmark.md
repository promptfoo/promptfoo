---
sidebar_label: HLE Benchmark
---

# Evaluating LLMs with Humanity's Last Exam (HLE)

[Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249) is designed to be the final frontier of closed-ended academic testing. Created by nearly 1,000 experts across 500+ institutions in 50+ countries, it features 3,000+ multi-modal questions spanning 100+ subjects. Each question is unambiguous, resistant to internet lookup, and verified against state-of-the-art LLMs to ensure difficulty.

This guide shows you how to run this challenging benchmark against any LLM using promptfoo to test models against questions that push the boundaries of AI capabilities.

## About HLE

HLE raises the bar for AI testing with:

- 3,000+ expert-crafted questions across 100+ subjects
- Multi-modal format combining text and images
- Graduate/PhD level difficulty with emphasis on mathematical reasoning
- Both multiple-choice (20%) and exact-match (80%) formats
- Current SOTA: 26.6% on public test set (OpenAI DeepResearch)
- Typical model performance: 3-13%

## Prerequisites

- promptfoo CLI installed
- API keys for the models you want to test
- HuggingFace account and access token (for HLE dataset)

## Setup

### 1. Install promptfoo

```bash
npm install -g promptfoo
```

### 2. Set up your API keys

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export DEEPSEEK_API_KEY=sk-...
```

### 3. Set up HuggingFace authentication

```bash
export HF_TOKEN=your_token_here
```

## Configuration

Create a `promptfooconfig.yaml` file. The following configuration is adapted from the [official HLE eval code](https://github.com/centerforaisafety/hle):

```yaml
description: "Humanity's Last Exam Benchmark"

prompts:
  - |
    You are an expert test taker. Answer the following question step by step.

    Question ID: {{ id }}
    Question: {{ question }}

    {% if image %}
    Image: {{ image }}
    {% endif %}

    {% if choices %}
    Options:
    A) {{ choices[0] }}
    B) {{ choices[1] }}
    C) {{ choices[2] }}
    D) {{ choices[3] }}
    {% endif %}

    Question Type: {{ answer_type }}
    Subject: {{ raw_subject }}
    Category: {{ category }}

    {% if answer_type == "exactMatch" %}
    Your response should be in the following format:
    Explanation: {your detailed step-by-step explanation}
    Exact Answer: {your succinct, final answer}
    Confidence: {your confidence score between 0% and 100% for your answer}
    {% else %}
    Your response should be in the following format:
    Explanation: {your detailed step-by-step explanation}
    Answer: {your chosen answer A/B/C/D}
    Confidence: {your confidence score between 0% and 100% for your answer}
    {% endif %}

providers:
  - openai:o3-mini
  # - deepseek:deepseek-reasoner

defaultTest:
  assert:
    - type: llm-rubric
      value: |
        Judge whether the following [response] to [question] is correct or not based on the precise and unambiguous [correct_answer] below.

        [question]: {{ question }}

        [response]: {{ output }}

        Your judgement must be in the format and criteria specified below:

        extracted_final_answer: The final exact answer extracted from the [response]. Put the extracted answer as 'None' if there is no exact, final answer to extract from the response.

        [correct_answer]: {{ answer }}

        reasoning: Explain why the extracted_final_answer is correct or incorrect based on [correct_answer], focusing only on if there are meaningful differences between [correct_answer] and the extracted_final_answer. Do not comment on any background to the problem, do not attempt to solve the problem, do not argue for any answer different than [correct_answer], focus only on whether the answers match.

        correct: Answer 'yes' if extracted_final_answer matches the [correct_answer] given above, or is within a small margin of error for numerical problems. Answer 'no' otherwise, i.e. if there if there is any inconsistency, ambiguity, non-equivalency, or if the extracted answer is incorrect.

        confidence: The extracted confidence score between 0% and 100% from [response]. Put 100 if there is no confidence score available.

tests:
  # Load HLE dataset from Hugging Face
  - huggingface://datasets/cais/hle?split=test&limit=100
```

## Running the Evaluation

1. Run the evaluation:
   ```bash
   promptfoo eval
   ```

2. View the results:
   ```bash
   promptfoo view
   ```

## Example Questions

Here are some examples of the types of questions you'll be testing against:

### Advanced Physics

```
Question ID: PHY-291
Question: Calculate the Berry phase for a spin-1/2 particle in a magnetic field that traces a closed path on the Bloch sphere. Show your work.

Answer Type: exactMatch
Subject: Quantum Mechanics
Category: Geometric Phases
```

### Medical Science

```
Question ID: MED-891
Question: Compare vector serotype selection and transgene design in ROCTAVIAN vs HEMGENIX for hemophilia treatment. Explain key differences in Factor VIII expression.

Answer Type: exactMatch
Subject: Medical Science
Category: Gene Therapy
```

## Customization Options

### Adjust Sample Size

Control the number of questions tested:

```yaml
tests:
  - huggingface://datasets/cais/hle?split=test&limit=50
```

### Advanced Prompt Configuration

For a more sophisticated approach that handles different model types and multimodal questions, you can use a JavaScript prompt function. The HLE example includes a `prompt.js` file that:

- Handles different response formats for different model types
- Properly formats multiple choice questions
- Supports image questions
- Adapts system prompts for reasoning models (o1, o3)

```yaml
prompts:
  - file://prompt.js
```

### Different Prompting Strategies

You can also try different static prompting approaches:

```yaml
prompts:
  - file://prompts/zero-shot.txt
  - file://prompts/chain-of-thought.txt
  - file://prompts/few-shot.txt
```

## Quick Start with Examples

Get started quickly with our pre-built example:

```bash
npx promptfoo@latest init --example hle
```

This will create a ready-to-use configuration that you can run immediately.

## Additional Resources

- [HLE Paper](https://arxiv.org/abs/2501.14249)
- [HLE Dataset](https://huggingface.co/datasets/cais/hle)
- [Official HLE Evaluation Code](https://github.com/centerforaisafety/hle)
- [promptfoo Documentation](https://promptfoo.dev/docs/getting-started) 