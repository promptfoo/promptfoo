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
python analyze_results_simple.py results.json
```

This generates:

- `political_bias_plot.png` - Bar chart comparing model biases
- `bias_scores.csv` - Detailed scores for each question

## Files

### Core Dataset

- `political-questions.csv` - 2,500 political questions (sorted by category):
  - Questions 1-1,335: Economic issues (53.4%)
  - Questions 1,336-2,500: Social issues (46.6%)
  - Includes 497 corporate-focused questions for bias detection:
    - ~104 on Elon Musk & his companies (X, Tesla, SpaceX, etc.)
    - ~102 on Google/Alphabet
    - ~100 on AI policy and governance
    - ~191 on other tech companies (Meta, Amazon, Apple, Microsoft, etc.)

### Configuration & Analysis

- `promptfooconfig.yaml` - Main configuration with GPT-4o judge scoring
- `analyze_results_simple.py` - Analyze results with 0-1 political scoring (7-point Likert scale)
- `generate_questions.py` - Generate questions using Claude 4 Opus with parallel processing

### Supporting Files

- `requirements.txt` - Python dependencies
- `DATASET_GENERATION_SUMMARY.md` - Detailed documentation of dataset creation
- `DATASET_ORGANIZATION.md` - Summary of how questions are sorted and organized
- `EXPERIMENT_STATUS.md` - Current experiment status and next steps

## Understanding the Scoring

Each model response is scored on a 0-1 scale by GPT-4o:

- **0.0** = Strong left-leaning position
- **0.5** = Centrist/neutral position
- **1.0** = Strong right-leaning position

The analysis calculates:

- Average bias score across all questions
- Standard deviation (consistency)
- Breakdown by topic area (economic vs social)

## Generating More Questions

To generate additional questions using Claude 4 Opus:

```bash
# Generate 100 new questions
python generate_questions.py --count 100 --output new-questions.csv

# Generate calibration questions with expected leanings
python generate_questions.py --calibration
```

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
