# huggingface-bbq

Evaluate LLMs for social bias using the [BBQ (Bias Benchmark for QA)](https://arxiv.org/abs/2110.08193), a comprehensive bias benchmark spanning nine social dimensions. BBQ tests how models handle questions involving protected attributes in both ambiguous and clear contexts.

**📖 [Read the complete BBQ benchmark guide →](https://www.promptfoo.dev/docs/guides/bbq-benchmark/)**

You can run this example with:

```bash
npx promptfoo@latest init --example huggingface-bbq
```

## Prerequisites

- OpenAI API key set as `OPENAI_API_KEY`
- Anthropic API key set as `ANTHROPIC_API_KEY`
- Hugging Face access token (required for dataset access)

## Setup

Set your Hugging Face token:

```bash
export HF_TOKEN=your_token_here
```

Or add it to your `.env` file:

```env
HF_TOKEN=your_token_here
```

Get your token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

## Run the Evaluation

Run the evaluation:

```bash
npx promptfoo@latest eval
```

View results:

```bash
npx promptfoo@latest view
```

## What's Tested

This evaluation tests models for bias across nine social dimensions:

- **Age**: Stereotypes about older vs. younger people
- **Disability Status**: Biases toward people with disabilities  
- **Gender Identity**: Gender-based stereotypes and assumptions
- **Nationality**: National origin and citizenship biases
- **Physical Appearance**: Appearance-based stereotypes
- **Race/Ethnicity**: Racial and ethnic biases
- **Religion**: Religious stereotypes and discrimination
- **Socioeconomic Status (SES)**: Class-based biases
- **Sexual Orientation**: LGBTQ+ related biases

Each question is tested in two contexts:
- **Ambiguous**: Insufficient information to determine correct answer (tests stereotype reliance)
- **Disambiguated**: Clear information provided (tests bias override of correct answers)

## Understanding BBQ Results

BBQ measures bias using a specialized scoring system:

- **Bias Score**: Ranges from -1 (anti-stereotype bias) to +1 (pro-stereotype bias)
- **Context Performance**: Accuracy in ambiguous vs. disambiguated scenarios  
- **Stereotype Alignment**: How often models choose stereotype-consistent answers
- **Bias Override**: Whether models ignore correct information due to bias

**Expected patterns in responsible models:**
- High accuracy in disambiguated contexts
- Frequent "Can't be determined" responses in ambiguous contexts
- Low bias scores across all social dimensions

## Current Model Performance

BBQ is designed to reveal bias patterns that may not be apparent in standard benchmarks. Research findings show:

- **Stereotype reliance**: Models consistently reproduce social biases in under-informative contexts
- **Bias override**: Models show 3.4 percentage points higher accuracy when correct answers align with biases
- **Gender amplification**: Gender-related biases show particularly strong effects (>5 percentage points)

These patterns highlight the importance of specialized bias evaluation beyond general capability testing.

## Customization

### Test Specific Social Dimensions

Focus on particular bias categories:

```yaml
tests:
  - huggingface://datasets/heegyu/bbq?split=test&filter=category:Gender_identity&limit=50
  - huggingface://datasets/heegyu/bbq?split=test&filter=category:Race_ethnicity&limit=50
```

### Test Context Conditions

Compare ambiguous vs. disambiguated performance:

```yaml
tests:
  - huggingface://datasets/heegyu/bbq?split=test&filter=context_condition:ambig&limit=100
  - huggingface://datasets/heegyu/bbq?split=test&filter=context_condition:disambig&limit=100
```

### Add More Models

Compare bias patterns across model families:

```yaml
providers:
  - anthropic:claude-sonnet-4-20250514
  - openai:gpt-4o-2024-08-06
  - openai:gpt-3.5-turbo
  - anthropic:claude-haiku-20240620
```

### Different Prompting Strategies

Test various approaches to bias mitigation:

```yaml
prompts:
  - file://prompt.py:create_bbq_prompt
  - 'Please answer this question objectively, avoiding stereotypes: {{question}}'
  - 'Context: {{context}}\nQuestion: {{question}}\nPlease choose the most accurate answer based solely on the provided information.'
```

## Ethical Considerations

- BBQ contains scenarios involving protected social categories
- Use responsibly as part of comprehensive bias testing
- Results should inform bias mitigation, not perpetuate harm
- Consider your organization's AI ethics guidelines before deployment

## Resources

- [BBQ Paper](https://arxiv.org/abs/2110.08193) - Original research from NYU
- [BBQ Dataset](https://huggingface.co/datasets/heegyu/bbq) - Dataset on HuggingFace  
- [BBQ Repository](https://github.com/nyu-mll/BBQ) - Official code and data
- [Promptfoo Documentation](https://promptfoo.dev/docs/getting-started)