---
sidebar_position: 1
---

# HuggingFace Datasets

Evaluating your LLMs against established benchmarks has never been easier. With promptfoo's HuggingFace integration, you can load popular evaluation datasets with minimal configuration.

## Quick Start

```yaml
# Test against MMLU benchmark
tests: huggingface://datasets/cais/mmlu?split=test&subset=mathematics

# Or use ChatGPT prompts dataset
tests: huggingface://datasets/fka/awesome-chatgpt-prompts

# Or evaluate across languages with XNLI
tests: huggingface://datasets/xnli?languages=["en","fr","es"]

# Combine with other sources
tests:
  - huggingface://datasets/cais/mmlu
  - file://regression_tests.csv
  - vars:
      input: "Direct test case"
      expected: "Expected output"
```

:::tip
See the [Datasets Overview](/docs/configuration/datasets) for all available data sources and the [CSV guide](/docs/configuration/tests/csv) for spreadsheet-based testing.
:::

## Authentication

Some datasets require authentication to access. To authenticate with HuggingFace:

1. Create a HuggingFace account at [huggingface.co](https://huggingface.co)
2. Generate an access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
3. Set your token:
   ```sh
   export HUGGING_FACE_HUB_TOKEN=your_token_here
   # Or in .env file:
   HUGGING_FACE_HUB_TOKEN=your_token_here
   ```

:::tip
If you encounter "401 Unauthorized" errors, check your authentication setup and dataset permissions.
:::

## Popular Evaluation Datasets

### MMLU (Massive Multitask Language Understanding)

[MMLU](https://huggingface.co/datasets/cais/mmlu) tests knowledge across 57 subjects, from mathematics to law. Example usage:

```yaml
prompts:
  - |
    You are an expert test taker. Please solve the following multiple choice question step by step.

    Question: {{question}}

    Options:
    A) {{choices[0]}}
    B) {{choices[1]}}
    C) {{choices[2]}}
    D) {{choices[3]}}

    Think through this step by step, then provide your final answer in the format "Therefore, the answer is A/B/C/D."

tests:
  # Test specific subjects
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra
  - huggingface://datasets/cais/mmlu?split=test&subset=anatomy
  - huggingface://datasets/cais/mmlu?split=test&subset=astronomy

defaultTest:
  assert:
    - type: regex
      value: "Therefore, the answer is [ABCD]\\."
    - type: llm-rubric
      value: Response must include clear step-by-step reasoning
```

### ARC (AI2 Reasoning Challenge)

[ARC](https://huggingface.co/datasets/ai2_arc) tests grade-school level scientific reasoning. Example usage:

```yaml
prompts:
  - |
    Answer the following science question:
    {{question}}

    Choose from these options:
    {{choices | join: "\n"}}

    Explain your reasoning step by step, then state your final answer.

tests:
  # Challenge set (harder questions)
  - huggingface://datasets/allenai/ai2_arc?config=ARC-Challenge
  # Easy set
  - huggingface://datasets/allenai/ai2_arc?config=ARC-Easy&limit=100

defaultTest:
  assert:
    - type: contains-any
      value: '{{choices}}'
```

### HellaSwag

[HellaSwag](https://huggingface.co/datasets/Rowan/hellaswag) tests common sense reasoning through sentence completion. Example usage:

```yaml
prompts:
  - |
    Complete this situation in the most likely way:
    {{ctx}}

    Options:
    {{endings | enumerate}}

    Explain which ending is most likely and why.

tests:
  - huggingface://datasets/Rowan/hellaswag?split=validation

defaultTest:
  assert:
    - type: contains-any
      value: '{{endings}}'
```

### TruthfulQA

[TruthfulQA](https://huggingface.co/datasets/truthful_qa) tests model truthfulness and ability to avoid misinformation. Example usage:

```yaml
prompts:
  - |
    Question: {{question}}

    Provide a truthful answer and explain your reasoning.
    Include relevant facts and cite sources where possible.

tests:
  - huggingface://datasets/truthful_qa/generation

defaultTest:
  assert:
    - type: model-graded/factuality
      value: 0.7
```

### GSM8K (Grade School Math)

[GSM8K](https://huggingface.co/datasets/gsm8k) tests mathematical reasoning through word problems. Example usage:

```yaml
prompts:
  - |
    Solve this math problem step by step:
    {{question}}

    Show your work and explain each step.
    End with "Therefore, the answer is [X]."

tests:
  - huggingface://datasets/gsm8k?config=main

defaultTest:
  assert:
    - type: contains
      value: '{{answer}}'
    - type: llm-rubric
      value: Response must show clear mathematical steps
```

### SQuAD (Stanford Question Answering Dataset)

[SQuAD](https://huggingface.co/datasets/squad) tests reading comprehension and question answering. Example usage:

```yaml
prompts:
  - |
    Read the following context and answer the question:

    Context: {{context}}

    Question: {{question}}

    Provide a concise answer based only on the given context.

tests:
  - huggingface://datasets/squad?split=validation

defaultTest:
  assert:
    - type: similar
      value: '{{answers.text[0]}}'
      threshold: 0.8
```

### XNLI (Cross-lingual Natural Language Inference)

[XNLI](https://huggingface.co/datasets/xnli) tests natural language inference across multiple languages. Example usage:

```yaml
prompts:
  - |
    Premise: {{premise}}
    Hypothesis: {{hypothesis}}

    Does the premise entail, contradict, or neither (neutral) with respect to the hypothesis?
    Explain your reasoning and state your final answer as: entailment/contradiction/neutral

tests:
  - huggingface://datasets/xnli?split=test&languages=["en","fr","es"]

defaultTest:
  assert:
    - type: contains-any
      value: ['entailment', 'contradiction', 'neutral']
```

### WikiANN (Named Entity Recognition)

[WikiANN](https://huggingface.co/datasets/wikiann) tests ability to identify named entities in text. Example usage:

```yaml
prompts:
  - |
    Identify all named entities (Person, Location, Organization) in this text:
    {{tokens | join: " "}}

    Format your answer as: Entity (Type)

tests:
  - huggingface://datasets/wikiann?split=test&languages=en

defaultTest:
  assert:
    - type: contains-any
      value: ['(PER)', '(LOC)', '(ORG)']
```

### BIG-bench

[BIG-bench](https://huggingface.co/datasets/bigbench) is a collaborative benchmark with diverse tasks. Example usage:

```yaml
prompts:
  - |
    {{input}}

    Provide your answer following any task-specific instructions.

tests:
  # Load specific tasks
  - huggingface://datasets/bigbench?config=simple_arithmetic_json
  - huggingface://datasets/bigbench?config=logical_deduction
```

### AgentBench

[AgentBench](https://huggingface.co/datasets/THUDM/AgentBench) tests LLM capabilities in realistic scenarios. Example usage:

```yaml
prompts:
  - |
    Task: {{task_description}}
    Context: {{context}}

    Respond with a solution that addresses the task requirements.

tests:
  - huggingface://datasets/THUDM/AgentBench?split=test
```

### MT-Bench

[MT-Bench](https://huggingface.co/datasets/lmsys/mt_bench) evaluates multi-turn conversations. Example usage:

```yaml
prompts:
  - |
    System: You are a helpful AI assistant.
    User: {{turn_1}}
    Assistant: Let me help you with that.
    User: {{turn_2}}

tests:
  - huggingface://datasets/lmsys/mt_bench

defaultTest:
  assert:
    - type: model-graded/answer-relevance
      value: 0.7
```

### ChatGPT Prompts

[awesome-chatgpt-prompts](https://huggingface.co/datasets/fka/awesome-chatgpt-prompts) provides a curated collection of effective prompts. Example usage:

```yaml
prompts:
  - |
    {{act}}: {{prompt}}

tests:
  - huggingface://datasets/fka/awesome-chatgpt-prompts
```

### Math Evaluation

Several datasets are available for testing mathematical reasoning:

#### MATH-500

[MATH-500](https://huggingface.co/datasets/HuggingFaceH4/MATH-500) is a carefully curated set of challenging math problems. Example usage:

```yaml
prompts:
  - |
    Solve this math problem step by step:
    {{problem}}

    Show your work and explain each step.

tests:
  - huggingface://datasets/HuggingFaceH4/MATH-500

defaultTest:
  assert:
    - type: llm-rubric
      value: Solution must show clear mathematical reasoning
```

#### NuminaMath-CoT

[NuminaMath-CoT](https://huggingface.co/datasets/AI-MO/NuminaMath-CoT) provides chain-of-thought examples for math problem solving. Example usage:

```yaml
prompts:
  - |
    Question: {{question}}

    Think through this step by step, then provide your final answer.

tests:
  - huggingface://datasets/AI-MO/NuminaMath-CoT?limit=100

defaultTest:
  assert:
    - type: contains
      value: '{{answer}}'
```

#### AceMath

[AceMath](https://huggingface.co/datasets/nvidia/AceMath-Instruct-Training-Data) from NVIDIA offers a large collection of math instruction examples. Example usage:

```yaml
prompts:
  - |
    {{instruction}}

    Provide a detailed solution showing your work.

tests:
  - huggingface://datasets/nvidia/AceMath-Instruct-Training-Data?limit=50
```

### Specialized Evaluation

#### MMVU (Multimodal Video Understanding)

[MMVU](https://huggingface.co/datasets/yale-nlp/MMVU) tests understanding of video content. Example usage:

```yaml
prompts:
  - |
    Watch this video and answer:
    {{question}}

tests:
  - huggingface://datasets/yale-nlp/MMVU?split=test
```

#### Medical Reasoning

[medical-o1-reasoning-SFT](https://huggingface.co/datasets/FreedomIntelligence/medical-o1-reasoning-SFT) tests medical knowledge and reasoning. Example usage:

```yaml
prompts:
  - |
    Medical Question: {{question}}

    Provide a detailed medical explanation and answer.

tests:
  - huggingface://datasets/FreedomIntelligence/medical-o1-reasoning-SFT?limit=100

defaultTest:
  assert:
    - type: llm-rubric
      value: Response must demonstrate medical knowledge and reasoning
```

#### Code Instructions

[react-code-instructions](https://huggingface.co/datasets/cfahlgren1/react-code-instructions) tests ability to understand and generate React code. Example usage:

```yaml
prompts:
  - |
    Create a React component that:
    {{instruction}}

    Provide the complete code with explanations.

tests:
  - huggingface://datasets/cfahlgren1/react-code-instructions?limit=50

defaultTest:
  assert:
    - type: llm-rubric
      value: Code must be valid React and follow best practices
```

## Configuration Options

You can customize the dataset loading using query parameters:

```yaml
# Load from training split
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=train

# Load from validation split with custom config
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=validation&config=custom

# Limit the number of test cases
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?limit=100

# Load specific languages for multilingual datasets
tests: huggingface://datasets/xnli?languages=["en","fr","de"]

# Combine multiple parameters
tests: huggingface://datasets/cais/mmlu?split=test&subset=mathematics&limit=50
```

### Supported Parameters

| Parameter   | Description                                   | Default   |
| ----------- | --------------------------------------------- | --------- |
| `split`     | Dataset split to load (train/test/validation) | `test`    |
| `config`    | Dataset configuration name                    | `default` |
| `limit`     | Maximum number of test cases to load          | No limit  |
| `subset`    | Dataset subset (if supported)                 | None      |
| `languages` | Language codes for multilingual datasets      | None      |

## Best Practices

1. **Use Limits**: Start with a small subset of the dataset using the `limit` parameter to test your configuration.
2. **Choose Appropriate Splits**: Use `test` split for final evaluations, `validation` for development.
3. **Handle Missing Fields**: Ensure your prompts handle cases where dataset fields might be missing.
4. **Cache Results**: Enable caching to avoid re-running evaluations on the same data.
5. **Match Dataset Fields**: Review the dataset documentation to understand available fields and their formats.
6. **Consider Language**: For multilingual datasets, specify language configurations where applicable.
7. **Validate Outputs**: Use appropriate assertions for each dataset type (e.g., regex for multiple choice).
8. **Use Appropriate Metrics**: Choose evaluation metrics that match the dataset type (e.g., exact match for multiple choice, similarity for open-ended).

## Troubleshooting

If you encounter issues:

1. Check that the dataset exists and is publicly accessible
2. Verify the field names match your prompt variables
3. Ensure you have sufficient permissions if using private datasets:
   - Check that your HuggingFace token is set correctly
   - Verify you're logged in with `huggingface-cli login`
   - Request access to the dataset if needed
4. Check the dataset documentation for specific configuration options
5. For large datasets, use the `limit` parameter to test your setup first
6. Verify that your prompts handle the dataset's specific format correctly
7. Review dataset-specific requirements (e.g., language codes, subsets)

### Common Issues

#### 401 Unauthorized

- Ensure `HUGGING_FACE_HUB_TOKEN` is set correctly
- Check if the dataset requires explicit access
- Try logging in via CLI: `huggingface-cli login`

#### Dataset Not Found

- Verify the dataset name and owner
- Check if the dataset is private
- Ensure you have the correct permissions

#### Invalid Configuration

- Check if the dataset supports the specified split
- Verify subset names are correct
- Ensure language codes are valid for multilingual datasets

## Related Resources

- [Loading from CSV Files](/docs/configuration/tests/csv)
- [Configuration Guide](/docs/configuration/guide)
- [Provider Configuration](/docs/configuration/reference)
