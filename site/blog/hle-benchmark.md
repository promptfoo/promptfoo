---
date: 2025-02-01
image: /img/blog/deepseek/deepseek_panda.png
---

# Benchmarking LLMs Against Humanity's Last Exam

Today, OpenAI announced DeepResearch, achieving 26.6% accuracy on the public test set of [Humanity's Last Exam (HLE)](https://huggingface.co/datasets/cais/hle) - doubling the previous state-of-the-art of [13.3%](https://agi.safe.ai/) set by O3-mini only a few days ago. This breakthrough comes at a critical time, as top models now exceed 90% accuracy on traditional benchmarks like [MMLU](https://huggingface.co/datasets/cais/mmlu).

[Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249) is designed to be the final frontier of closed-ended academic testing. Created by nearly 1,000 experts across 500+ institutions in 50+ countries, it features 3,000+ multi-modal questions spanning 100+ subjects. Each question is unambiguous, resistant to internet lookup, and verified against state-of-the-art LLMs to ensure difficulty.

In this article, we'll show you how to run this challenging benchmark against any LLM using promptfoo. We'll test models like O3-mini and DeepSeek-R1 against questions that push the boundaries of AI capabilities.

![Humanity's Last Exam Benchmark Results](/img/blog/deepseek/deepseek_panda.png)

<!-- truncate -->

## What is HLE?

HLE raises the bar for AI testing with:

- 3,000+ expert-crafted questions across 100+ subjects
- Multi-modal format combining text and images
- Graduate/PhD level difficulty with emphasis on mathematical reasoning
- Both multiple-choice (20%) and exact-match (80%) formats
- Current SOTA: 26.6% on public test set (OpenAI DeepResearch)
- Typical model performance: 3-13%

## Quick Start

1. Install promptfoo:

   ```bash
   npm install -g promptfoo
   ```

2. Create `promptfooconfig.yaml`:

   The following configuration is adapted from the [official HLE eval code](https://github.com/centerforaisafety/hle):

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
     - deepseek:deepseek-r1

   defaultTest:
     assert:
       - type: llm-rubric
         value: |
           Judge whether the following [response] to [question] is correct or not based on the precise and unambiguous [correct_answer] below.

           [question]: {{ vars.question }}

           [response]: {{ response }}

           Your judgement must be in the format and criteria specified below:

           extracted_final_answer: The final exact answer extracted from the [response]. Put the extracted answer as 'None' if there is no exact, final answer to extract from the response.

           [correct_answer]: {{ vars.answer }}

           reasoning: Explain why the extracted_final_answer is correct or incorrect based on [correct_answer], focusing only on if there are meaningful differences between [correct_answer] and the extracted_final_answer. Do not comment on any background to the problem, do not attempt to solve the problem, do not argue for any answer different than [correct_answer], focus only on whether the answers match.

           correct: Answer 'yes' if extracted_final_answer matches the [correct_answer] given above, or is within a small margin of error for numerical problems. Answer 'no' otherwise, i.e. if there if there is any inconsistency, ambiguity, non-equivalency, or if the extracted answer is incorrect.

           confidence: The extracted confidence score between 0% and 100% from [response]. Put 100 if there is no confidence score available.

       - type: latency
         threshold: 60000
   tests:
     # Load HLE dataset from Hugging Face
     - huggingface://datasets/cais/hle?split=test&limit=100
   ```

3. Set up your API keys:

   ```bash
   export OPENAI_API_KEY=sk-...
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

4. Run and view results:
   ```bash
   promptfoo eval
   promptfoo view
   ```

## Example Questions

Here's what you're testing against:

#### Advanced Physics

```
Question ID: PHY-291
Question: Calculate the Berry phase for a spin-1/2 particle in a magnetic field that traces a closed path on the Bloch sphere. Show your work.

Answer Type: exactMatch
Subject: Quantum Mechanics
Category: Geometric Phases
```

#### Medical Science

```
Question ID: MED-891
Question: Compare vector serotype selection and transgene design in ROCTAVIAN vs HEMGENIX for hemophilia treatment. Explain key differences in Factor VIII expression.

Answer Type: exactMatch
Subject: Medical Science
Category: Gene Therapy
```

## Customization Options

1. Test specific subjects:

   ```yaml
   tests:
     - huggingface://datasets/cais/hle?split=test&subject=quantum_mechanics
   ```

2. Try different prompting strategies:
   ```yaml
   prompts:
     - file://prompts/zero-shot.txt
     - file://prompts/chain-of-thought.txt
   ```

Ready to start? Run:

```bash
npx promptfoo@latest init --example hle
```

[Get Started](https://promptfoo.dev/docs/getting-started) | [View Dataset](https://huggingface.co/datasets/cais/hle) | [HLE Paper](https://arxiv.org/abs/2501.14249)

---

**Want to try it yourself?** Get started with:

```bash
npx promptfoo@latest init --example hle
```

[Get Started with promptfoo](https://promptfoo.dev/docs/getting-started) | [View HLE Dataset](https://huggingface.co/datasets/cais/hle)
