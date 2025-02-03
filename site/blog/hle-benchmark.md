---
date: 2025-02-01
image: /img/blog/hle/hero.png
---

# Benchmarking LLMs Against Humanity's Last Exam

[Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249) is a groundbreaking benchmark designed to be the final frontier of closed-ended academic testing. With over 3,000 expert-crafted questions spanning 100+ subjects, it represents the pinnacle of human knowledge assessment.

Today, we'll show you how to run this benchmark against any LLM using promptfoo, complete with automatic grading and detailed performance analysis.

![Humanity's Last Exam Benchmark Results](/img/blog/hle/results.png)

<!-- truncate -->

## Why HLE Matters

While models achieve >90% accuracy on traditional benchmarks like MMLU, HLE pushes the boundaries with:

- Questions from nearly 1,000 subject matter experts across 500+ institutions
- Multi-modal challenges combining text, math, and visual reasoning
- Unprecedented difficulty level (current SOTA: 13% accuracy)

## Setting Up the Evaluation

Let's create a configuration that can evaluate any LLM against HLE. Create a new file called `promptfooconfig.yaml`:

```yaml
description: "Humanity's Last Exam Benchmark"

prompts:
  - |
    You are an expert test taker. Please solve the following question step by step.
    
    Question: {{question}}
    
    {{#if choices}}
    Options:
    A) {{choices.[0]}}
    B) {{choices.[1]}}
    C) {{choices.[2]}}
    D) {{choices.[3]}}
    {{/if}}
    
    Think through this step by step, then provide your final answer.
    {{#if choices}}Format your final answer as "Therefore, the answer is A/B/C/D."{{/if}}

providers:
  # Add your preferred models here
  - openai:gpt-4
  - anthropic:claude-3-opus
  - deepseek:deepseek-coder
  
defaultTest:
  assert:
    # Enforce step-by-step reasoning
    - type: llm-rubric
      value: Response must include clear step-by-step reasoning
    # Set reasonable timeout
    - type: latency
      threshold: 60000
    # Verify answer format for multiple choice
    - type: regex
      value: "Therefore, the answer is [ABCD]\\."
      
tests:
  # Load HLE dataset from Hugging Face
  - huggingface://datasets/cais/hle?split=test&limit=100
```

## Running the Evaluation

1. Install promptfoo if you haven't already:
   ```bash
   npm install -g promptfoo
   ```

2. Set up your API keys:
   ```bash
   export OPENAI_API_KEY=sk-...
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Run the evaluation:
   ```bash
   promptfoo eval
   ```

4. View results in a web interface:
   ```bash
   promptfoo view
   ```

## Understanding the Results

The evaluation provides rich insights into model performance:

- Overall accuracy across subjects
- Reasoning quality assessment
- Response time analysis
- Confidence calibration
- Subject-specific performance breakdowns

[INSERT SCREENSHOT OF RESULTS DASHBOARD]

## Customizing the Evaluation

You can modify the configuration to:

1. Test specific subjects:
   ```yaml
   tests:
     - huggingface://datasets/cais/hle?split=test&subject=quantum_mechanics
   ```

2. Adjust grading criteria:
   ```yaml
   defaultTest:
     assert:
       - type: llm-rubric
         value: |
           Response must:
           1. Show clear mathematical reasoning
           2. Cite relevant principles/theorems
           3. Arrive at a precise answer
   ```

3. Compare different prompting strategies:
   ```yaml
   prompts:
     - file://prompts/zero-shot.txt
     - file://prompts/chain-of-thought.txt
     - file://prompts/few-shot.txt
   ```

## What's Next?

As models improve, we expect to see rapid progress on HLE scores. You can:

1. Track your model's progress over time
2. Compare different model versions
3. Experiment with prompt engineering
4. Contribute to the benchmark

The full evaluation code is available in our [examples repository](https://github.com/promptfoo/promptfoo/tree/main/examples/hle).

## Additional Resources

- [HLE Paper](https://arxiv.org/abs/2501.14249)
- [HLE Dataset](https://huggingface.co/datasets/cais/hle)
- [promptfoo Documentation](https://promptfoo.dev/docs/getting-started)

---

**Want to try it yourself?** Get started with:

```bash
npx promptfoo@latest init --example hle
```

[INSERT CTA BUTTONS/LINKS] 