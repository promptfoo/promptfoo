---
sidebar_label: 'DeepSeek-R1 vs o1'
description: 'Learn how to benchmark DeepSeek-R1 against OpenAI o1 on reasoning tasks using the MMLU benchmark.'
---

# DeepSeek-R1 vs o1: Benchmarking Reasoning Capabilities

DeepSeek has released their R1 model specifically optimized for reasoning tasks, making it a natural competitor to OpenAI's o1 model. This guide walks you through how to compare these models using the Massive Multitask Language Understanding (MMLU) benchmark, focusing on subjects that test reasoning capabilities.

The end result will be a detailed comparison showing how each model performs across different types of reasoning tasks, with metrics for accuracy, response quality, and speed.

## Prerequisites

Before we begin, you'll need:

- promptfoo CLI installed. If not, refer to the [installation guide](/docs/installation)
- An OpenAI API key set as `OPENAI_API_KEY`
- A DeepSeek API key set as `DEEPSEEK_API_KEY`

## Step 1: Setup

Create a new directory for your comparison project:

```sh
npx promptfoo@latest init deepseek-vs-o1
cd deepseek-vs-o1
```

## Step 2: Configure the Comparison

Edit the `promptfooconfig.yaml` file to define your comparison:

1. **Description and Providers**:

   ```yaml
   description: 'DeepSeek-R1 vs o1 comparison on MMLU reasoning tasks'

   providers:
     - openai:o1
     - deepseek:deepseek-reasoner
   ```

2. **Prompt Template**:
   Create a clear template for multiple choice questions that encourages step-by-step reasoning:

   ```yaml
   prompts:
     - |
       You are an expert test taker. Please solve the following multiple choice question step by step.

       Question: {{question}}

       Options:
       A) {{choices.0}}
       B) {{choices.1}}
       C) {{choices.2}}
       D) {{choices.3}}

       Think through this step by step, then provide your final answer in the format "Therefore, the answer is [A/B/C/D]."
   ```

3. **Default Assertions**:
   Set up quality checks that apply to all responses:

   ```yaml
   defaultTest:
     assert:
       # Inference should complete within 60 seconds
       - type: latency
         threshold: 60000
       # Check for step-by-step reasoning
       - type: llm-rubric
         value: Response must include clear step-by-step reasoning
       # Check that it ends with a clear answer choice
       - type: regex
         value: "Therefore, the answer is [ABCD]\\."
   ```

4. **Test Cases**:
   Load questions from MMLU's reasoning-focused subjects:
   ```yaml
   tests:
     # Load MMLU test sets for reasoning-heavy subjects
     - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra
     - huggingface://datasets/cais/mmlu?split=test&subset=formal_logic
     - huggingface://datasets/cais/mmlu?split=test&subset=high_school_mathematics
     - huggingface://datasets/cais/mmlu?split=test&subset=college_mathematics
     - huggingface://datasets/cais/mmlu?split=test&subset=logical_fallacies
     # Limit to first 10 questions from each subject to keep the test manageable
     - limit: 10
   ```

## Step 3: Run the Comparison

Execute the comparison:

```sh
npx promptfoo@latest eval
```

To view the results in a web interface:

```sh
npx promptfoo@latest view
```

## Understanding the Results

The comparison evaluates the models across several dimensions:

### 1. Subject-Specific Performance

Look at how each model performs across different subjects:

- **Abstract Algebra**: Tests advanced mathematical reasoning
- **Formal Logic**: Tests ability to work with logical statements
- **High School Mathematics**: Tests foundational problem-solving
- **College Mathematics**: Tests advanced mathematical thinking
- **Logical Fallacies**: Tests ability to identify flaws in reasoning

### 2. Response Quality Metrics

For each response, examine:

- **Accuracy**: Does the model arrive at the correct answer?
- **Reasoning Steps**: How clearly does it explain its thinking?
- **Response Time**: How quickly does it solve each problem?
- **Format Adherence**: Does it follow the requested answer format?

### 3. Comparative Analysis

Consider these aspects when analyzing results:

1. **Strengths and Weaknesses**:

   - Does one model excel at certain types of problems?
   - Are there patterns in the mistakes each model makes?

2. **Reasoning Approaches**:

   - How do their step-by-step explanations differ?
   - Which model provides clearer or more insightful reasoning?

3. **Performance Consistency**:
   - Are results consistent across similar question types?
   - Does performance degrade with problem complexity?

## Customizing the Evaluation

You can modify the comparison in several ways:

1. **Add More Subjects**:

   ```yaml
   tests:
     - huggingface://datasets/cais/mmlu?split=test&subset=physics
     - huggingface://datasets/cais/mmlu?split=test&subset=computer_science
   ```

2. **Adjust Sample Size**:

   ```yaml
   tests:
     # Test more questions per subject
     - limit: 20
   ```

3. **Modify Assertions**:

   ```yaml
   defaultTest:
     assert:
       # Add stricter timing requirements
       - type: latency
         threshold: 30000
       # Check for specific reasoning patterns
       - type: llm-rubric
         value: Must show work for mathematical calculations
   ```

4. **Change Prompt Style**:
   Experiment with different prompting strategies to optimize performance.

## Best Practices

1. **Consistent Environment**:

   - Run comparisons in the same time period
   - Use the same hardware/network conditions
   - Keep model versions consistent

2. **Statistical Significance**:

   - Use enough samples per subject (10-20 minimum)
   - Look for patterns across multiple runs
   - Consider confidence intervals in results

3. **Fair Comparison**:
   - Use identical prompts for both models
   - Apply the same evaluation criteria
   - Account for any API rate limits

## Cost Considerations

Both models have different pricing structures:

- o1: Higher cost but potentially more capable
- DeepSeek-R1: Generally lower cost but may need more tokens

Monitor costs during testing and adjust sample sizes accordingly.

## What's Next?

After running this comparison, you'll have a clear understanding of:

- Which model performs better for different types of reasoning
- The trade-offs in terms of accuracy, speed, and cost
- How to optimize prompts for each model's strengths

Consider extending the comparison to:

- More MMLU subjects
- Different prompt formats
- Additional reasoning-focused models
- Custom domain-specific questions

Remember that MMLU is just one benchmark. Your specific use case might benefit from additional testing with domain-specific questions or real-world problems.
