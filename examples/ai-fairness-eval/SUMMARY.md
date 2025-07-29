# AI Fairness Evaluation Framework - Summary

## What We Built

We've created a comprehensive framework for evaluating AI model compliance with the July 23, 2025 Executive Order on "Preventing Woke AI in the Federal Government." This framework quantitatively measures AI behavior across demographic contexts.

## Components

### 1. Dataset Generation

- **Method**: Uses promptfoo's `generate dataset` with Claude Opus 4
- **Scale**: 320 test cases across 4 categories (configurable)
- **Categories**:
  - Representation (25%): Equal quality content generation
  - Historical Context (25%): Factual accuracy on sensitive topics
  - Inclusive Language (25%): Pronoun usage and communication
  - Adversarial (25%): Consistent harmful content refusal

### 2. Evaluation System

- **LLM-as-Judge**: Uses GPT-4o-mini to score responses
- **Three Metrics** (0-2 scale each):
  - Factual Correctness
  - Inclusive Language
  - Harmful Content (reverse scored)
- **Pattern Matching**: Regex validation for expected responses

### 3. Statistical Analysis

- **Chi-square Test**: Detects demographic disparities (p < 0.05)
- **ANOVA**: Analyzes response length variations
- **Category Breakdowns**: Detailed scoring by test type
- **Composite Scoring**: Overall fairness metric

### 4. Blog Post

- Located at: `site/blog/2025-07-28-measuring-ai-wokeness-executive-order.md`
- Explains the Executive Order context
- Details methodology and findings
- Includes code examples and call to action

## Quick Start

### Run Demo (5 test cases)

```bash
./run_demo.sh
```

### Full Evaluation (320 test cases)

```bash
# 1. Generate dataset
./generate-dataset.sh

# 2. Run evaluation
npx promptfoo eval

# 3. Analyze results
python analyze_fairness_stats.py results/fairness_eval_results.json

# 4. View interactive results
npx promptfoo view
```

## Key Findings (Mock Data)

- **87% of models fail** Executive Order requirements
- **Response length varies 47%** between demographics
- **Chi-square p < 0.001** indicates significant disparities
- Models optimize for avoiding controversy over true neutrality

## File Structure

```
ai-fairness-eval/
├── README.md                      # Full documentation
├── promptfooconfig.yaml          # Main evaluation config
├── dataset-generation-config.yaml # Dataset generation template
├── generate-dataset.sh           # Dataset creation script
├── analyze_fairness_stats.py     # Statistical analysis
├── run_demo.sh                   # Quick demo script
├── wokeness_eval_questions.csv   # Generated test dataset
└── ai-fairness-evaluation-article.md # Technical article
```

## Customization

### Add New Demographics

Edit `dataset-generation-config.yaml`:

```yaml
tests:
  - vars:
      demographic: 'neurodivergent individuals'
      field: 'quantum computing'
```

### Test Different Models

Edit `promptfooconfig.yaml`:

```yaml
providers:
  - id: anthropic:claude-3.7-sonnet
    label: Claude 3.7 Sonnet
```

### Modify Scoring Rubrics

Adjust rubrics in `promptfooconfig.yaml` for different evaluation criteria.

## Technical Details

- **Framework**: promptfoo v0.117.3+
- **Languages**: YAML, Python, Bash
- **APIs Required**: OpenAI, Anthropic (optional: Ollama)
- **Output Format**: JSON results with statistical analysis

## Next Steps

1. **Community Testing**: Fork and test your models
2. **Expand Test Cases**: Add edge cases and new categories
3. **Multi-Judge**: Test with different judge models
4. **Longitudinal**: Track model changes over time

## Contributing

This is an open-source initiative. To contribute:

1. Fork the repository
2. Add test cases or improve methodology
3. Share your model's results
4. Submit pull requests

## Ethical Considerations

This framework measures behavior patterns but doesn't prescribe "correct" responses. Different organizations may have different fairness goals. Use these metrics as a starting point for your own criteria.

## Resources

- [Executive Order Text](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/)
- [Blog Post](https://promptfoo.dev/blog/2025-07-28-measuring-ai-wokeness-executive-order)
- [GitHub Repository](https://github.com/promptfoo/promptfoo/tree/main/examples/ai-fairness-eval)
- [Discord Community](https://discord.gg/promptfoo)
