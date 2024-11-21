# F-Score HuggingFace Dataset Sentiment Analysis Eval

This project evaluates GPT-4o-mini's zero-shot performance on IMDB movie review sentiment analysis using promptfoo.

## Quick Start

```bash
promptfoo eval
```

The evaluation dataset (`imdb_eval_sample.csv`) is included, so you can run the evaluation immediately.

## Dataset

The example uses the IMDB dataset from HuggingFace's datasets library, sampled to 100 reviews for efficient evaluation. The dataset is pre-processed into a CSV with two columns:

- `text`: The movie review content
- `sentiment`: The label ("positive" or "negative")

## Custom Metrics Implementation

The evaluation implements F-score and related metrics using promptfoo's assertion system:

1. **Base Metrics** (using JavaScript assertions):

```yaml
- type: javascript
  value: "output.sentiment === 'positive' && context.vars.sentiment === 'positive' ? 1 : 0"
  metric: true_positives
```

2. **Derived Metrics** (calculated from base metrics):

```yaml
- name: precision
  value: true_positives / (true_positives + false_positives)

- name: f1_score
  value: 2 * true_positives / (2 * true_positives + false_positives + false_negatives)
```

## Files

- `promptfooconfig.yaml`: Defines prompt, assertions, and metrics
- `imdb_eval_sample.csv`: Pre-generated evaluation dataset

## Optional Dataset Preparation

If you want to generate a new evaluation dataset:

1. Install Python dependencies:

```bash
pip install -r requirements.txt
```

2. Run the preparation script:

```bash
python prepare_data.py
```

## Metrics Overview

The evaluation tracks:

- **True/False Positives/Negatives**: Base metrics for classification
- **Precision**: TP / (TP + FP)
- **Recall**: TP / (TP + FN)
- **F1 Score**: 2 _ (precision _ recall) / (precision + recall)
- **Accuracy**: (TP + TN) / Total

Each model response includes:

- Sentiment classification
- Confidence score (1-10)
- Reasoning for the decision

## Notes

- Uses HuggingFace's IMDB dataset (test split)
- Implements custom F-score metrics using promptfoo's assertion system
- Labels are in human-readable format (positive/negative)
- All metrics treat "positive" as the positive class
