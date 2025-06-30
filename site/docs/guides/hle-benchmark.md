---
title: Testing Humanity's Last Exam with Promptfoo
description: Evaluate LLMs against Humanity's Last Exam, the most challenging AI benchmark with questions from 1,000+ experts across 100+ subjects.
sidebar_label: HLE Benchmark
keywords:
  [
    hle,
    humanity's last exam,
    llm benchmark,
    ai evaluation,
    model testing,
    claude,
    gpt,
    promptfoo,
    expert questions,
  ]
image: /img/hle-token-usage-summary.png
sidebar_position: 6
date: 2025-06-30
authors: [michael]
---

# Testing Humanity's Last Exam with Promptfoo

[Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249) is a challenging benchmark created by 1,000+ subject experts from over 500 institutions to test AI capabilities at the frontier of human knowledge. Unlike existing benchmarks where current models achieve 90%+ accuracy on MMLU, HLE presents genuinely difficult expert-level questions.

This guide demonstrates how to evaluate models against HLE using promptfoo, including:

- Setting up HLE evaluations with promptfoo
- Configuration examples for reasoning models
- Real performance data from Claude 4 and o4-mini
- Analysis of model strengths and limitations

## About Humanity's Last Exam

HLE addresses benchmark saturation - the phenomenon where advanced models achieve over 90% accuracy on existing tests like MMLU, making it difficult to measure continued progress. HLE was designed to provide a more challenging evaluation.

**Key characteristics:**

- Created by 1,000+ PhD-level experts across 500+ institutions
- Covers 100+ subjects from mathematics to humanities
- 14% include images alongside text
- Questions resist simple web search solutions
- Focuses on verifiable, closed-ended problems

**Current model performance:**

| Model                | Accuracy | Notes                    |
| -------------------- | -------- | ------------------------ |
| OpenAI Deep Research | 26.6%    | With search capabilities |
| o4-mini              | ~13%     | Reasoning model          |
| DeepSeek-R1          | 8.5%     | Text-only evaluation     |
| o1                   | 8.0%     | Previous generation      |
| Gemini 2.0 Flash     | 6.6%     | Multimodal support       |
| Claude 3.5 Sonnet    | 4.1%     | Base model               |

_Current model performance on HLE as of publication_

## Running the Evaluation

To evaluate your models against HLE:

```bash
npx promptfoo@latest init --example huggingface-hle
cd huggingface-hle
npx promptfoo@latest eval
```

Configure the required API keys:

- `OPENAI_API_KEY` - for o4-mini and GPT models
- `ANTHROPIC_API_KEY` - for Claude 4 with thinking mode
- `HF_TOKEN` - obtain from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

Promptfoo automatically manages dataset loading, parallel execution, cost tracking, and results analysis.

## Evaluation Results

We evaluated Claude 4 and o4-mini on 50 HLE questions using promptfoo's framework to demonstrate real-world performance.

![Model Comparison on Bioinformatics Question](/img/hle-model-comparison-detail.png)

The above example shows both models attempting a complex bioinformatics question involving population genetics calculations. The interface displays complete reasoning traces and comparative analysis.

**Performance summary:**

- **Combined pass rate**: 28% (28/100 total test cases)
- **Runtime**: 9 minutes with 20 concurrent workers
- **Token usage**: Approximately 237K tokens for 100 test cases

The models showed significantly different performance characteristics:

| Model    | Success Rate | Token Usage | Avg Cost | Avg Latency |
| -------- | ------------ | ----------- | -------- | ----------- |
| o4-mini  | 42% (21/50)  | 139,580     | $0.56    | 17.6s       |
| Claude 4 | 14% (7/50)   | 97,552      | $1.26    | 28.8s       |

**Question categories evaluated:**

- **Advanced Mathematics**: Galois theory, polynomial irreducibility
- **Quantum Physics**: K-matrix descriptions, field theory
- **Genetics**: Watterson's theta calculations, population dynamics
- **Philosophy**: Arrhenius impossibility theorems, Kantian aesthetics

<div style={{display: 'flex', alignItems: 'center', gap: '20px', margin: '20px 0'}}>
  <div style={{flex: 1}}>
    The promptfoo interface allows customization of displayed dataset columns. Users can toggle visibility of variables like author attribution, rationales, and metadata to focus on relevant information for their evaluation needs.
  </div>
  <div style={{flex: '0 0 300px'}}>
    <img src="/img/hle-dataset-columns.png" alt="HLE Dataset Variables" style={{width: '100%', height: 'auto'}} />
  </div>
</div>

After completing the evaluation, promptfoo generates a comprehensive summary report showing token usage, costs, success rates, and performance metrics across all tested models:

![HLE Evaluation Results](/img/hle-token-usage-summary.png)

## Prompt Engineering for HLE

The evaluation uses a custom Python prompt that formats HLE questions appropriately for different model types. Here's how the prompt system works:

```python title="prompt.py"
def create_hle_prompt(context):
    """
    Creates a chat message prompt for HLE benchmark questions.
    Handles both multiple choice and exact answer questions, with image support.
    """
    question_data = context["vars"]
    model_info = context["provider"]

    # Choose instructions based on question type
    instructions = _get_response_instructions(question_data)

    # Build complete question text with options if multiple choice
    full_question = _build_question_text(question_data)

    # Create chat messages (uses 'developer' role for o1/o3 models)
    messages = _create_chat_messages(instructions, full_question, model_info)

    # Add image message if present
    if _has_image(question_data):
        image_message = _create_image_message(question_data, model_info)
        messages.append(image_message)

    return json.dumps(messages)
```

**Example rendered prompt for a philosophy question:**

```json
[
  {
    "role": "system",
    "content": "Your response should be in the following format:\nExplanation: {your explanation for your answer choice}\nAnswer: {your chosen answer}\nConfidence: {your confidence score between 0% and 100% for your answer}"
  },
  {
    "role": "user",
    "content": "Which condition of Arrhenius's sixth impossibility theorem do critical views violate?\n\nOptions:\nA) Weak Non-Anti-Egalitarianism\nB) Non-Sadism\nC) Transitivity\nD) Completeness"
  }
]
```

This structured approach ensures consistent formatting across models while adapting to provider-specific requirements (like using `developer` role for OpenAI's reasoning models).

## Configuration for Expert-Level Questions

Testing revealed specific configurations that perform well for HLE's challenging requirements:

```yaml title="promptfooconfig.yaml"
description: HLE benchmark evaluation

prompts:
  - file://prompt.py:create_hle_prompt

providers:
  - id: anthropic:claude-sonnet-4-20250514
    config:
      thinking:
        type: enabled
        budget_tokens: 3000
      max_tokens: 4000
  - id: openai:o4-mini
    config:
      max_completion_tokens: 4000

tests:
  - huggingface://datasets/cais/hle?split=test&limit=50
```

**Configuration rationale:**

- **3K thinking tokens**: Supports Claude's multi-step reasoning on complex proofs
- **4K max tokens**: Prevents streaming warnings while allowing detailed explanations
- **50 questions**: Provides meaningful sample size for evaluation
- **Custom prompts**: Structured prompts demonstrate improved performance over raw questions

## Customization Options

**Test more questions:**

```yaml
tests:
  - huggingface://datasets/cais/hle?split=test&limit=200
```

**Add more models:**

```yaml
providers:
  - anthropic:claude-sonnet-4-20250514
  - openai:o4-mini
  - deepseek:deepseek-reasoner
```

**Increase reasoning budget:**

```yaml
providers:
  - id: anthropic:claude-sonnet-4-20250514
    config:
      thinking:
        budget_tokens: 8000 # For complex proofs
      max_tokens: 12000
```

## Question Analysis: Model Performance Patterns

Analysis of individual responses reveals interesting patterns in how models approach different question types.

**Chess Strategy Example**

> "Black to move. Without moving the black queen, which sequence is mate in 2?"
>
> **Answer**: `Rxf3, Rf1#`  
> **Claude 4**: Provided strategic analysis without identifying specific moves
> **o4-mini**: Unable to process the question appropriately

This demonstrates the challenge of precise tactical calculation versus general strategic reasoning.

**Philosophy Example**

> "Which condition of Arrhenius's sixth impossibility theorem do critical views violate?"
>
> **Claude 4**: Selected "Non-Sadism" (incorrect)
> **o4-mini**: Correctly identified "Weak Non-Anti-Egalitarianism"

Performance on specialized academic content appears to depend significantly on training data coverage of specific terminology.

**Observed pattern**: Success correlates strongly with domain-specific knowledge and exposure to precise academic terminology rather than general reasoning capability alone.

## Evaluation Limitations

Several important limitations should be considered when interpreting these results:

**Sample Size and Statistical Significance**

- Results based on 50 questions per model (100 total test cases)
- Single evaluation run without confidence intervals
- Small sample size may not represent full HLE performance distribution
- o4-mini's 42% success rate is surprising but requires validation with larger samples

**Configuration Choices**

- Token budgets chosen somewhat arbitrarily (3K thinking tokens for Claude 4)
- No systematic optimization of prompt engineering approaches
- Fixed temperature and other hyperparameters without tuning
- Limited exploration of different reasoning strategies

**Methodological Constraints**

- Questions sampled from test set without domain stratification
- No analysis of question difficulty variation within the sample
- Evaluation metrics focus on binary pass/fail rather than partial credit
- No consideration of answer confidence calibration

**Generalizability**

- Results may not generalize to the full 14,000+ question HLE dataset
- Performance could vary significantly across different subject areas
- Model versions tested may not reflect latest capabilities
- Evaluation environment differs from models' intended use cases

These limitations suggest treating the results as preliminary indicators rather than definitive performance assessments. Future evaluations should incorporate larger sample sizes, systematic hyperparameter optimization, and statistical significance testing.

## View Your Results

After evaluation completes:

```bash
npx promptfoo@latest view
```

Promptfoo's interactive web interface provides:

- Question-by-question breakdown with full reasoning traces
- Token usage and cost analysis
- Side-by-side model comparison with diff highlighting
- Performance analytics by subject area

## Implications for AI Development

HLE provides a useful benchmark for measuring AI progress on expert-level academic tasks. The low current scores indicate significant room for improvement in AI reasoning capabilities.

As Dan Hendrycks (CAIS co-founder) notes:

> "When I released the MATH benchmark in 2021, the best model scored less than 10%; few predicted that scores higher than 90% would be achieved just three years later. Right now, Humanity's Last Exam shows there are still expert questions models cannot answer. We will see how long that lasts."

**Key findings:**

- Current reasoning models achieve modest performance on expert-level questions
- Success varies significantly by domain and question type
- Token budget increases alone don't guarantee accuracy improvements
- Substantial gaps remain between AI and human expert performance

Promptfoo provides evaluation capabilities for HLE through automated dataset integration, parallel execution, and comprehensive results analysis.

**Get started:**

```bash
npx promptfoo@latest init --example huggingface-hle
```

## Learn More

### Official Resources

- [HLE Research Paper](https://arxiv.org/abs/2501.14249) - Original academic paper from CAIS and Scale AI
- [HLE Dataset](https://huggingface.co/datasets/cais/hle) - Dataset on Hugging Face
- [Official HLE Website](https://lastexam.ai) - Questions and leaderboard
- [Scale AI HLE Announcement](https://scale.com/blog/humanitys-last-exam-results) - Official results and methodology

### Analysis and Coverage

- [OpenAI Deep Research Performance](https://scale.com/blog/o3-o4-mini-calibration) - Deep Research achieving 26.6% accuracy
- [Medium: HLE Paper Review](https://medium.com/@sulbha.jindal/humanitys-last-exam-hle-paper-review-69316b2cfc04) - Technical analysis of the benchmark
- [Hugging Face Papers](https://huggingface.co/papers/2501.14249) - Community discussion and insights

### Promptfoo Integration

- [HuggingFace Provider Guide](../providers/huggingface.md) - Setting up dataset access
- [Model Grading Setup](../configuration/expected-outputs/model-graded/) - Automated evaluation
- [Anthropic Provider](../providers/anthropic.md) - Claude 4 configuration
