# grok-4-political-bias

This example measures the political bias of Grok 4 compared to other major AI models using a comprehensive dataset of 2,500 political opinion questions, including specific questions designed to detect corporate bias in AI responses.

📖 **Read the full analysis**: [Grok 4 Goes Red? Yes, But Not How You Think](https://promptfoo.dev/blog/grok-4-political-bias/)

You can run this example with:

```bash
npx promptfoo@latest init --example grok-4-political-bias
```

## Environment Variables

This example requires the following environment variables:

- `XAI_API_KEY` - Your xAI API key for Grok 4
- `GOOGLE_API_KEY` - Your Google API key for Gemini 2.5 Pro
- `OPENAI_API_KEY` - Your OpenAI API key for GPT-4.1
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude Opus 4

You can set these in a `.env` file or directly in your environment.

## Quick Start

### 1. Set Environment Variables

```bash
export XAI_API_KEY="your_xai_api_key"
export GOOGLE_API_KEY="your_google_api_key"
export OPENAI_API_KEY="your_openai_api_key"
export ANTHROPIC_API_KEY="your_anthropic_api_key"
```

### 2. Run the Experiment

```bash
# Full evaluation with all models
npx promptfoo@latest eval -c promptfooconfig.yaml --output results.json

# Multi-judge analysis (4 models × 4 judges)
npx promptfoo@latest eval -c promptfooconfig-multi-judge.yaml --output results-multi-judge.json
```

### 3. Analyze Results

```bash
# View results in the web UI
npx promptfoo@latest view

# Generate analysis charts
python analyze_results_multi_judge.py
python generate_political_spectrum_chart.py
```

## Results Summary

The experiment reveals:

- **All models lean left of center** (0.5 on our scale)
- **Grok 4 is the most right-leaning** but still scores 0.685 (left-leaning)
- **Grok shows extreme bipolar behavior** with 67.9% extreme responses
- **Anti-Musk bias detected** in Grok's responses about Musk companies

## Files

### Core Dataset

- `political-questions.csv` - 2,500 political questions covering:
  - Economic policy questions (taxation, welfare, regulation)
  - Social issue questions (immigration, healthcare, civil rights)
  - Corporate bias detection questions targeting major tech companies
  - Contemporary political debates on AI, technology, and governance

### Configuration Files

- `promptfooconfig.yaml` - Main configuration for basic evaluation
- `promptfooconfig-multi-judge.yaml` - Multi-judge configuration (4×4 matrix)
- `political-bias-rubric.yaml` - 7-point Likert scale rubric for political scoring

### Analysis Scripts

- `analyze_results_multi_judge.py` - Comprehensive multi-judge analysis
- `generate_political_spectrum_chart.py` - Creates political positioning visualizations
- `analyze_corporate_bias.py` - Analyzes responses to Musk-related questions
- `extract_high_variance.py` - Finds questions with highest judge disagreement

### Results Files

- `results.json` - Full evaluation results from the basic experiment
- `results-multi-judge.json` - Results from multi-judge analysis (4×4 matrix)

## Understanding the Scoring

Each model response is scored on a 0-1 scale:

- **0.0** = Strongly right-wing position
- **0.5** = Centrist/neutral position
- **1.0** = Strongly left-wing position

The analysis includes:

- Average bias score across all questions
- Standard deviation (measuring consistency vs extremism)
- Breakdown by topic area (economic vs social)
- Inter-judge agreement analysis
- Self-scoring bias detection

## Cost Estimate

Running the full experiment:

- **Basic evaluation**: ~10,000 API calls (2,500 questions × 4 models)
- **Multi-judge analysis**: ~50,000 API calls (2,500 questions × 4 models × 5 evaluations)
- **Estimated cost**: $100-$150 for the complete multi-judge analysis

For testing with smaller samples:

```bash
# Test with 100 questions
head -101 political-questions.csv > test-100.csv

# Test economic questions only
grep ",economic$" political-questions.csv > economic-only.csv

# Test social questions only
grep ",social$" political-questions.csv > social-only.csv

# Use rate limiting
npx promptfoo@latest eval -c promptfooconfig.yaml --max-concurrency 5
```

## Key Findings

1. **Universal Left Bias**: All major AI models (GPT-4.1, Gemini 2.5 Pro, Claude Opus 4, Grok 4) lean left of center
2. **Grok's Instability**: Grok 4 shows 2× more extreme responses than competitors
3. **Corporate Overcorrection**: Grok is 14.1% harsher on Musk companies than other corporations
4. **Judge Bias**: Models score themselves 0.09 points more favorably on average

## Customization

Edit configuration files to:

- Add more models for comparison
- Adjust the judge scoring criteria
- Change temperature or other model parameters
- Modify the political bias rubric
- Focus on specific question categories
