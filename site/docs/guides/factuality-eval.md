---
sidebar_position: 1
title: Evaluating factuality
description: How to evaluate the factual accuracy of LLM outputs against reference information using promptfoo's factuality assertion
---

# Evaluating factuality

## What is factuality and why is it important?

Factuality is the measure of how accurately an LLM's response aligns with established facts or reference information. Simply put, it answers the question: "Is what the AI saying actually true?"

**A concrete example:**

> **Question:** "What is the capital of France?"  
> **AI response:** "The capital of France is Paris, which has been the country's capital since 987 CE."  
> **Reference fact:** "Paris is the capital of France."
>
> In this case, the AI response is factually accurate (it includes the correct capital) but adds additional information about when Paris became the capital.

As LLMs become increasingly integrated into critical applications, ensuring they provide factually accurate information is essential for:

- **Building trust**: Users need confidence that AI responses are reliable and truthful. _For example, a financial advisor chatbot that gives incorrect information about tax laws could cause users to make costly mistakes and lose trust in your service._

- **Reducing misinformation**: Factually incorrect AI outputs can spread misinformation at scale. _For instance, a healthcare bot incorrectly stating that a common vaccine is dangerous could influence thousands of patients to avoid important preventative care._

- **Supporting critical use cases**: Applications in healthcare, finance, education, and legal domains require high factual accuracy. _A legal assistant that misrepresents case law precedents could lead to flawed legal strategies with serious consequences._

- **Improving model selection**: Comparing factuality across models helps choose the right model for your application. _A company might discover that while one model is more creative, another has 30% better factual accuracy for technical documentation._

- **Identifying hallucinations**: Factuality evaluation helps detect when models "make up" information. _For example, discovering that your product support chatbot fabricates non-existent troubleshooting steps 15% of the time would be a critical finding._

promptfoo's factuality evaluation enables you to systematically measure how well your model outputs align with reference facts, helping you identify and address issues before they reach users.

## Quick Start: Try it today

The fastest way to get started with factuality evaluation is to use our pre-built TruthfulQA example:

```bash
# Initialize the example - this command creates a new directory with all necessary files
npx promptfoo@latest init --example huggingface-dataset-factuality

# Change into the newly created directory
cd huggingface-dataset-factuality

# Run the evaluation - this executes the factuality tests using the models specified in the config
npx promptfoo eval

# View the results in an interactive web interface
npx promptfoo view
```

What these commands do:

1. The first command initializes a new project using our huggingface-dataset-factuality example template
2. The second command navigates into the project directory
3. The third command runs the factuality evaluation against the TruthfulQA dataset
4. The final command opens the results in your browser for analysis

This example:

- Fetches the TruthfulQA dataset (designed to test model truthfulness)
- Creates test cases with built-in factuality assertions
- Compares model outputs against reference answers
- Provides detailed factuality scores and analysis

You can easily customize it by:

- Uncommenting additional providers in `promptfooconfig.yaml` to test more models
- Adjusting the prompt template to change how questions are asked
- Modifying the factuality scoring weights to match your requirements

## How factuality evaluation works

promptfoo implements a structured factuality evaluation methodology based on [OpenAI's evals](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml), using the [`factuality`](/docs/configuration/expected-outputs#model-assisted-eval-metrics) assertion type.

The model-graded factuality check takes the following three inputs:

- **Prompt**: prompt sent to the LLM
- **Output**: text produced by the LLM
- **Reference**: the ideal LLM output, provided by the author of the eval

### Key terminology explained

The evaluation classifies the relationship between the LLM output and the reference into one of five categories:

- **A**: Output is a subset of the reference and is fully consistent with it
  - _Example: If the reference is "Paris is the capital of France and has a population of 2.1 million," a subset would be "Paris is the capital of France" — it contains less information but is fully consistent_

- **B**: Output is a superset of the reference and is fully consistent with it
  - _Example: If the reference is "Paris is the capital of France," a superset would be "Paris is the capital of France and home to the Eiffel Tower" — it adds accurate information while maintaining consistency_

- **C**: Output contains all the same details as the reference
  - _Example: If the reference is "The Earth orbits the Sun," and the output is "The Sun is orbited by the Earth" — same information, different wording_

- **D**: Output and reference disagree
  - _Example: If the reference is "Paris is the capital of France," but the output claims "Lyon is the capital of France" — this is a factual disagreement_

- **E**: Output and reference differ, but differences don't affect factuality
  - _Example: If the reference is "The distance from Earth to the Moon is 384,400 km," and the output says "The Moon is about 384,000 km from Earth" — the small difference doesn't materially affect factuality_

By default, categories A, B, C, and E are considered passing (with customizable scores), while category D (disagreement) is considered failing.

## Creating a basic factuality evaluation

To set up a simple factuality evaluation for your LLM outputs:

1. **Create a configuration file** with a factuality assertion:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4.1-mini
prompts:
  - |
    Please answer the following question accurately:
    Question: What is the capital of {{location}}?
tests:
  - vars:
      location: California
    assert:
      - type: factuality
        value: The capital of California is Sacramento
```

2. **Run your evaluation**:

```bash
npx promptfoo eval
npx promptfoo view
```

This will produce a report showing how factually accurate your model's responses are compared to the reference answers.

## Comparing Multiple Models

Factuality evaluation is especially useful for comparing how different models perform on the same facts:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4.1-mini
  - openai:gpt-4.1
  - anthropic:claude-3-7-sonnet-20250219
  - google:gemini-2.0-flash
prompts:
  - |
    Question: What is the capital of {{location}}?
    Please answer accurately.
tests:
  - vars:
      location: California
    assert:
      - type: factuality
        value: The capital of California is Sacramento
  - vars:
      location: New York
    assert:
      - type: factuality
        value: Albany is the capital of New York
```

## Evaluating On External Datasets

For comprehensive evaluation, you can run factuality tests against external datasets like TruthfulQA, which we covered in the Quick Start section.

### Creating Your Own Dataset Integration

You can integrate any dataset by:

1. **Create a dataset loader**: Use JavaScript/TypeScript to fetch and format your dataset
2. **Add factuality assertions**: Include a factuality assertion in each test case
3. **Reference in your config**:

```yaml
tests: file://your_dataset_loader.ts:generate_tests
```

## Crafting Effective Reference Answers

The quality of your reference answers is crucial for accurate factuality evaluation. Here are specific guidelines:

### What makes a good reference answer?

1. **Clarity**: State the fact directly and unambiguously
   - _Good: "The capital of France is Paris."_
   - _Avoid: "As everyone knows, the beautiful city of Paris serves as the capital of the magnificent country of France."_

2. **Precision**: Include necessary details without extraneous information
   - _Good: "Water freezes at 0 degrees Celsius at standard atmospheric pressure."_
   - _Avoid: "Water, H2O, freezes at 0 degrees Celsius, which is also 32 degrees Fahrenheit, creating ice that floats."_

3. **Verifiability**: Ensure your reference is backed by authoritative sources
   - _Good: "According to the World Health Organization, the COVID-19 pandemic was declared on March 11, 2020."_
   - _Avoid: "The COVID pandemic started sometime in early 2020."_

4. **Completeness**: Include all essential parts of the answer
   - _Good: "The three branches of the U.S. federal government are executive, legislative, and judicial."_
   - _Avoid: "The U.S. government has three branches."_

### Common pitfalls to avoid

1. **Subjective statements**: Avoid opinions or judgments in reference answers
2. **Temporally dependent facts**: Be careful with time-sensitive information
3. **Ambiguous wording**: Ensure there's only one way to interpret the statement
4. **Unnecessary complexity**: Keep references simple enough for clear evaluation

## Customizing the Evaluation

### Selecting the Grading Provider

By default, promptfoo uses `gpt-4.1-2025-04-14` for grading. To specify a different grading model:

```yaml
defaultTest:
  options:
    # Set the provider for grading factuality
    provider: openai:gpt-4.1
```

You can also override it per assertion:

```yaml
assert:
  - type: factuality
    value: The capital of California is Sacramento
    provider: anthropic:claude-3-7-sonnet-20250219
```

Or via the command line:

```bash
promptfoo eval --grader openai:gpt-4.1
```

### Customizing Scoring Weights

Tailor the factuality scoring to your specific requirements:

```yaml
defaultTest:
  options:
    factuality:
      subset: 1.0 # Category A: Output is a subset of reference
      superset: 0.8 # Category B: Output is a superset of reference
      agree: 1.0 # Category C: Output contains all the same details
      disagree: 0.0 # Category D: Output and reference disagree
      differButFactual: 0.7 # Category E: Differences don't affect factuality
```

#### Understanding the default scoring weights

By default, promptfoo uses a simple binary scoring system:

- Categories A, B, C, and E are assigned a score of 1.0 (pass)
- Category D (disagree) is assigned a score of 0.0 (fail)

**When to use custom weights:**

- Decrease `superset` if you're concerned about models adding potentially incorrect information
- Reduce `differButFactual` if precision in wording is important for your application
- Adjust `subset` downward if comprehensive answers are required

A score of 0 means fail, while any positive score is considered passing. The score values can be used for ranking and comparing model outputs.

### Customizing the Evaluation Prompt

For complete control over how factuality is evaluated, customize the prompt:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      You are an expert factuality evaluator. Compare these two answers:

      Question: {{input}}
      Reference answer: {{ideal}}
      Submitted answer: {{completion}}

      Determine if the submitted answer is factually consistent with the reference answer.
      Choose one option:
      A: Submitted answer is a subset of reference (fully consistent)
      B: Submitted answer is a superset of reference (fully consistent)
      C: Submitted answer contains same details as reference
      D: Submitted answer disagrees with reference
      E: Answers differ but differences don't affect factuality

      Respond with JSON: {"category": "LETTER", "reason": "explanation"}
```

You must implement the following template variables:

- `{{input}}`: The original prompt/question
- `{{ideal}}`: The reference answer (from the `value` field)
- `{{completion}}`: The LLM's actual response (provided automatically by promptfoo)

## Response Formats

The factuality checker supports two response formats:

1. **JSON format** (primary and recommended):

   ```json
   {
     "category": "A",
     "reason": "The submitted answer is a subset of the expert answer and is fully consistent with it."
   }
   ```

2. **Single Letter** (legacy format):

   ```
   (A) The submitted answer is a subset of the expert answer and is fully consistent with it.
   ```

## Best Practices

When setting up factuality evaluations:

1. **Choose reference answers carefully**: They should be accurate, clear, and comprehensive
2. **Consider multiple providers**: Different models may excel at different types of factual knowledge
3. **Customize scoring weights**: Adjust based on your application's tolerance for different types of factual issues
4. **Use a strong grader**: More capable models generally provide more reliable factuality assessments
5. **Test with known examples**: Validate your setup with questions where you know the correct answers

## See Also

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more evaluation options
- [Factuality assertion reference](/docs/configuration/expected-outputs/model-graded/factuality)
- [TruthfulQA example on GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/huggingface-dataset-factuality) - Complete code for the TruthfulQA factuality evaluation example
