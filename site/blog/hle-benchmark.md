---
date: 2025-02-01
image: /img/blog/deepseek/deepseek_panda.png
---

# Benchmarking LLMs Against Humanity's Last Exam

Today, OpenAI announced DeepResearch, doubling their performance on Humanity's Last Exam (HLE) from 13.3% with O3-mini to an impressive 26.6%. This breakthrough highlights the rapid advancement of AI capabilities in tackling expert-level knowledge assessments.

[Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249) is a groundbreaking benchmark designed to be the final frontier of closed-ended academic testing. Developed by nearly 1,000 subject matter experts across 500+ institutions in 50+ countries, it represents the pinnacle of human knowledge assessment with over 3,000 expert-crafted questions spanning 100+ subjects.

In this article, we'll show you how to run this challenging benchmark against any LLM using promptfoo, including O3-mini, DeepSeek-R1, and other state-of-the-art models. We'll walk through the setup, evaluation process, and how to analyze the results.

![Humanity's Last Exam Benchmark Results](/img/blog/deepseek/deepseek_panda.png)

<!-- truncate -->

## Why HLE Matters

While models achieve >90% accuracy on traditional benchmarks like MMLU, HLE pushes the boundaries with:

- **Expert-Level Difficulty**: Questions crafted by professors, researchers, and graduate degree holders
- **Multi-Modal Challenges**: 10% of questions combine text with visual elements
- **Diverse Question Types**: Both multiple-choice (20%) and exact-match (80%) formats
- **Rigorous Review Process**: Multi-stage expert review ensuring question quality and difficulty
- **Current SOTA Performance**: With OpenAI's latest DeepResearch announcement, state-of-the-art performance has jumped to 26.6%, while most models achieve 3-13% accuracy

## Question Requirements

Each HLE question adheres to strict criteria:

1. **Difficulty**: Graduate/PhD level or highly specific domain knowledge
2. **Precision**: Unambiguous, objectively correct answers
3. **Originality**: Not derivable from simple internet searches
4. **Verification**: Questions tested against frontier LLMs to ensure difficulty
5. **Expert Review**: Two-stage review process by subject matter experts

## Setting Up the Evaluation

Let's create a configuration that can evaluate any LLM against HLE. Create a new file called `promptfooconfig.yaml`:

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
        2. Proper application of domain-specific principles and terminology
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

The evaluation provides insights aligned with the HLE paper's metrics:

- **Overall Accuracy**: Current SOTA models achieve 3-9% accuracy
- **Calibration Analysis**: Models often show high confidence despite incorrect answers
- **Token Usage**: Analysis of completion tokens across different subjects
- **Subject Performance**: Breakdown across mathematics, sciences, humanities, etc.
- **Response Quality**: Assessment of reasoning steps and domain expertise

## Key Subject Areas

HLE covers a broad range of subjects including:

- Mathematics and Applied Mathematics
- Physics and Engineering
- Computer Science and AI
- Chemistry and Biochemistry
- Biology and Medicine
- Linguistics and Humanities
- Social Sciences and Law
- Arts and Classical Studies

### Example Questions

To illustrate the expert-level difficulty of HLE questions, here are two examples:

#### Linguistics Example
```
Question ID: LING-472
Question: In a newly documented creole language, analyze the following sentence structure:
"mi-go taso-fala blong-haus" (meaning: "I went to the house")

Identify the linguistic features present, considering:
a) The placement of articles and modals as prefixes
b) The verb-final word order pattern
c) The presence of split ergativity

Explain how these features interact and what this suggests about the language's substrate influences.

Answer Type: exactMatch
Subject: Linguistics
Category: Language Typology
```

#### Medical Science Example
```
Question ID: MED-891
Question: Compare and contrast the viral vector technologies used in the following approved hemophilia gene therapies:

1. ROCTAVIAN (valoctocogene roxaparvovec-rvox)
2. HEMGENIX (etranacogene dezaparvovec-drlb)
3. LENMELDY (atidarsagene autotemcel)

Analyze their:
a) Vector serotype selection
b) Transgene design differences
c) Impact on Factor VIII/IX expression
d) Safety profiles based on clinical trials

Provide a detailed technical assessment of why these specific design choices were made.

Answer Type: exactMatch
Subject: Medical Science
Category: Gene Therapy
```

These examples demonstrate the benchmark's emphasis on:
1. Expert-level domain knowledge
2. Integration of multiple technical concepts
3. Analysis rather than mere recall
4. Current, real-world applications
5. Precise, unambiguous evaluation criteria

## Customizing the Evaluation

You can modify the configuration to:

1. Focus on specific subjects:
   ```yaml
   tests:
     - huggingface://datasets/cais/hle?split=test&subject=quantum_mechanics
   ```

2. Adjust validation criteria:
   ```yaml
   defaultTest:
     assert:
       - type: llm-rubric
         value: |
           Response must:
           1. Show graduate-level understanding
           2. Apply domain-specific principles
           3. Provide precise, unambiguous answers
   ```

3. Test different prompting strategies:
   ```yaml
   prompts:
     - file://prompts/zero-shot.txt
     - file://prompts/chain-of-thought.txt
     - file://prompts/few-shot.txt
   ```

## Future Implications

The HLE paper suggests several key implications:

1. **Benchmark Longevity**: Designed to remain challenging even as models improve
2. **Progress Tracking**: Clear measure of advancement toward expert-level capabilities
3. **Capability Assessment**: Helps inform AI development and governance decisions
4. **Research Direction**: Identifies areas needing improvement in model capabilities

## Additional Resources

- [HLE Paper](https://arxiv.org/abs/2501.14249)
- [HLE Dataset](https://huggingface.co/datasets/cais/hle)
- [promptfoo Documentation](https://promptfoo.dev/docs/getting-started)

---

**Want to try it yourself?** Get started with:

```bash
npx promptfoo@latest init --example hle
```

[Get Started with promptfoo](https://promptfoo.dev/docs/getting-started) | [View HLE Dataset](https://huggingface.co/datasets/cais/hle) 