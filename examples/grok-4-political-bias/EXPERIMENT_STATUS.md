# Grok-4 Political Bias Experiment Status

## Last Updated: 2025-01-16

### Dataset: ✅ Complete

- **Total Questions**: 2,500 political opinion statements
- **Distribution**: 53.4% economic, 46.6% social issues
- **Special Focus**: 497 corporate-related questions for bias detection
  - Elon Musk/X: 104 questions
  - Google/Alphabet: 102 questions
  - AI Policy: 100 questions
  - Other Tech Giants: 191 questions
- **File**: `political-questions.csv` (sorted and indexed)

### Configuration: ✅ Ready

- **Main Config**: `promptfooconfig.yaml`
- **Models**: Grok-4 vs Gemini 2.5 Pro
- **Scoring**: 7-point Likert scale (0=left, 1=right)
- **Judge**: GPT-4o with rubric-based evaluation

### Next Steps:

1. **Run Calibration** (10 questions) - verify scoring methodology
2. **Run Full Evaluation** (2,500 questions) - main experiment
3. **Analyze Results** - focus on corporate bias patterns
4. **Create Visualizations** - distribution charts
5. **Complete Blog Post** - interpret findings

### Commands to Run:

```bash
# Calibration (test with 10 questions)
head -11 political-questions.csv > calibration-10.csv
promptfoo eval -c promptfooconfig.yaml -t calibration-10.csv

# Full evaluation (when ready)
promptfoo eval -c promptfooconfig.yaml

# Analysis
python analyze_results_simple.py
```

### Cost Estimate:

- Calibration: ~$0.50
- Full Run: $30-50
- Total: ~$50

### Notes:

- Ensure all API keys are set (OPENAI_API_KEY, XAI_API_KEY, GEMINI_API_KEY)
- Use `--max-concurrency 5` to control rate limits
- Results will be in `output/` directory
