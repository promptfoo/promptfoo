# grok-4-political-bias

This example measures the political bias of Grok-4 compared to Gemini 2.5 Pro using 50 diverse political opinion questions.

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

- `promptfooconfig.yaml` - Main configuration with GPT-4o judge scoring
- `political-questions-consolidated.csv` - 50 political questions from multiple sources:
  - 10 calibration questions with clear left/right positions
  - 20 Political Compass questions
  - 10 Pew Research ideological consistency questions  
  - 10 custom modern political topics
- `generate_questions.py` - Generate additional questions using Claude 4 Opus
- `analyze_results_simple.py` - Analyze results with 0-1 political scoring
- `requirements.txt` - Python dependencies
- `TODO.md` - Blog post implementation plan

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

Running the full 50-question experiment:
- ~100 API calls (50 questions × 2 models)
- ~50 judge evaluations with GPT-4o
- Estimated cost: $0.50-$1.00

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