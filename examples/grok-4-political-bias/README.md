# grok-4-political-bias

This example measures the political bias of Grok-4 compared to Gemini 2.5 Pro using a comprehensive dataset of 2,497 political opinion questions, including specific questions designed to detect corporate bias in AI responses.

## Quick Start

### 1. Set Environment Variables

```bash
export XAI_API_KEY="your_xai_api_key"
export GOOGLE_API_KEY="your_google_api_key"
export OPENAI_API_KEY="your_openai_api_key"  # For GPT-4o judge
export ANTHROPIC_API_KEY="your_anthropic_api_key"  # Optional: for generating more questions
```

### 2. Run the Experiment

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --output results.json
```

### 3. Analyze Results

```bash
# View results in the web UI
npx promptfoo@latest view
```

The results show:

- Average political bias scores for each model (0-1 scale)
- Standard deviation showing consistency/extremism
- Detailed scores for each question

## Files

### Core Dataset

- `political-questions.csv` - A comprehensive set of political questions covering:
  - Economic policy questions (taxation, welfare, regulation)
  - Social issue questions (immigration, healthcare, civil rights)
  - Corporate bias detection questions targeting major tech companies
  - Contemporary political debates on AI, technology, and governance

### Configuration Files

- `promptfooconfig.yaml` - Main configuration with multi-model judge scoring
- `political-bias-rubric.yaml` - 7-point Likert scale rubric for political scoring (0-1 scale)

### Results Files

- `results.json` - Full evaluation results from the experiment
- `results-multi-judge.json` - Results from multi-judge analysis (4×4 matrix)

## Understanding the Scoring

Each model response is scored on a 0-1 scale by GPT-4o:

- **0.0** = Strong left-leaning position
- **0.5** = Centrist/neutral position
- **1.0** = Strong right-leaning position

The analysis calculates:

- Average bias score across all questions
- Standard deviation (consistency)
- Breakdown by topic area (economic vs social)

## Dataset Structure

The political questions dataset was created using synthetic data generation with Claude 4 Opus to ensure:

- Balanced coverage of economic vs social issues
- Inclusion of corporate bias detection questions
- Contemporary political topics
- Questions designed to elicit clear political stances

## Cost Estimate

Running the full 2,497-question experiment:

- ~4,994 API calls (2,497 questions × 2 models)
- ~2,497 judge evaluations with GPT-4o
- Estimated cost: $30-$50 (depending on response lengths)

For testing, consider using a smaller sample:

- Use `--max-concurrency 5` to control rate
- Test with 100 questions first: `head -101 political-questions.csv > test-100.csv`
- Test economic questions only: `grep ",economic$" political-questions.csv > economic-only.csv`
- Test social questions only: `grep ",social$" political-questions.csv > social-only.csv`

## Customization

Edit `promptfooconfig.yaml` to:

- Add more models for comparison
- Adjust the judge scoring criteria
- Change temperature or other model parameters

## Running This Example

You can initialize this example with:

```bash
npx promptfoo@latest init --example grok-4-political-bias
```
