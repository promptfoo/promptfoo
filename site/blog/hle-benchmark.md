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

   ```yaml
   description: "Humanity's Last Exam Benchmark"

   prompts:
     - |
       You are an expert test taker. Please solve the following question step by step.

       Question ID: {{id}}
       Question: {{question}}

       {{#if image}}
       Image: {{image}}
       {{/if}}

       {{#if choices}}
       Options:
       A) {{choices.[0]}}
       B) {{choices.[1]}}
       C) {{choices.[2]}}
       D) {{choices.[3]}}
       {{/if}}

       Question Type: {{answer_type}}
       Subject: {{raw_subject}}
       Category: {{category}}

       Think through this step by step, then provide your final answer.
       {{#if choices}}Format your final answer as "Therefore, the answer is A/B/C/D."{{/if}}
       {{#if answer_type "exactMatch"}}Format your final answer exactly as requested in the question.{{/if}}

   providers:
     - openai:gpt-4
     - anthropic:claude-3-opus
     - deepseek:deepseek-coder

   defaultTest:
     assert:
       - type: llm-rubric
         value: |
           Response must demonstrate:
           1. Clear step-by-step reasoning showing expert-level understanding
           2. Proper application of domain-specific principles
           3. Precise calculations or logical deductions where applicable
           4. Unambiguous final answer in the required format
           5. No reliance on simple internet lookup or pattern matching

       - type: latency
         threshold: 60000

       - type: javascript
         value: |
           // Validate answer format based on question type
           if (vars.answer_type === "multipleChoice") {
             return response.match(/Therefore, the answer is [A-D]\./);
           }
           if (vars.answer_type === "exactMatch") {
             return response.includes(vars.answer);
           }
           return true;
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
