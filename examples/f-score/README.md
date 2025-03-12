# F-Score HuggingFace Dataset Sentiment Analysis Eval

This project evaluates GPT-4o-mini's zero-shot performance on IMDB movie review sentiment analysis using promptfoo. Each model response includes:

- Sentiment classification
- Confidence score (1-10)
- Reasoning for the classification

## Quick Start

Set your OpenAI API key and run the evaluation:

```bash
promptfoo eval
```

## Dataset

The evaluation uses the IMDB dataset from HuggingFace's datasets library, sampled to 100 reviews. The dataset is preprocessed into a CSV with two columns:

- `text`: The movie review content
- `sentiment`: The label ("positive" or "negative")

To modify the sample size or generate a new dataset, you can use `prepare_data.py`. First, install the Python dependencies:

```bash
pip install -r requirements.txt
```

Then run the preparation script:

```bash
python prepare_data.py
```

## Metrics Overview

The evaluation implements F-score and related metrics using promptfoo's assertion system:

1. **Base Metrics** calculated for each test case using JavaScript assertions:

```yaml
- type: javascript
  value: "output.sentiment === 'positive' && context.vars.sentiment === 'positive' ? 1 : 0"
  metric: true_positives
```

2. **Derived Metrics** calculated from base metrics after the evaluation completes:

```yaml
- name: precision
  value: true_positives / (true_positives + false_positives)

- name: f1_score
  value: 2 * true_positives / (2 * true_positives + false_positives + false_negatives)
```

The evaluation tracks:

- **True/False Positives/Negatives**: Base metrics for classification
- **Precision**: TP / (TP + FP)
- **Recall**: TP / (TP + FN)
- **F1 Score**: 2 × (precision × recall) / (precision + recall)
- **Accuracy**: (TP + TN) / Total
