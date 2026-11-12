# eval-f-score (F-Score HuggingFace Dataset Sentiment Analysis Eval)

You can run this example with:

```bash
npx promptfoo@latest init --example eval-f-score
cd eval-f-score
```

This project evaluates GPT-4.1-mini's zero-shot performance on IMDB movie review sentiment analysis using promptfoo. Each model response includes:

- Sentiment classification
- Confidence score (1-10)
- Reasoning for the classification

## Quick Start

Set your OpenAI API key and run the evaluation:

```bash
npx promptfoo@latest eval --no-cache
```

## Dataset

The evaluation uses the IMDB dataset from HuggingFace's datasets library, sampled to 100 reviews. The dataset is preprocessed into a CSV with two columns:

- `text`: The movie review content
- `sentiment`: The label ("positive" or "negative")

To modify the sample size or generate a new dataset, you can use `prepare_data.py`. This optional step requires Python 3.10 or newer; evaluating the included CSV does not require Python. Create an isolated environment and install the dependencies:

```bash
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
```

Then run the preparation script:

```bash
python prepare_data.py
```

Run the offline dependency regression checks without downloading IMDB:

```bash
python -m unittest discover -p '*_test.py'
```

## Metrics Overview

The JavaScript assertion returns a pass/fail accuracy grade together with `namedScores` for the four confusion-matrix counters. Correct positive and negative classifications both pass. The counters are aggregated without adding extra assertions to the overall score:

- **True/False Positives/Negatives**: Counts with `positive` as the positive class
- **Precision**: TP / (TP + FP)
- **Recall**: TP / (TP + FN)
- **F1 Score**: 2 × TP / (2 × TP + FP + FN)
- **Accuracy**: (TP + TN) / Total

Precision, recall, and F1 are reported as zero when their denominator is zero (for example, a batch containing only correctly classified negative reviews). The formulas are in `derivedMetrics` in `promptfooconfig.yaml`.
