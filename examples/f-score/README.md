# IMDB Sentiment Analysis Evaluation

This project demonstrates how to evaluate LLM performance on binary sentiment classification using the IMDB movie reviews dataset.

## Overview

The project uses promptfoo to evaluate LLM performance on sentiment analysis, calculating key binary classification metrics including:

- Accuracy
- Precision
- Recall
- F1 Score

## Setup

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Prepare the dataset:

```bash
python prepare_data.py
```

This will:

- Download the IMDB dataset from Hugging Face
- Create balanced samples for training and testing
- Save the samples as CSV files

3. Run the evaluation:

```bash
promptfoo eval
```

## Files

- `prepare_data.py`: Script to download and prepare the IMDB dataset
- `promptfooconfig.yaml`: Configuration for the LLM evaluation
- `requirements.txt`: Python dependencies
- `imdb_train_sample.csv`: Generated training data sample
- `imdb_test_sample.csv`: Generated test data sample

## Configuration

The `promptfooconfig.yaml` file defines:

- The prompt template for sentiment analysis
- Expected JSON response format
- Binary classification metrics calculation
- F1 score and related metrics

## Metrics

The evaluation tracks:

1. **Basic Metrics**

   - Accuracy: Overall correct predictions
   - True Positives: Correctly identified positive reviews
   - False Positives: Negative reviews classified as positive
   - False Negatives: Positive reviews classified as negative

2. **Derived Metrics**
   - Precision: TP / (TP + FP)
   - Recall: TP / (TP + FN)
   - F1 Score: 2 _ (precision _ recall) / (precision + recall)

## Sample Data

The script creates two datasets:

- Training sample: 100 reviews
- Test sample: 20 reviews

These samples are balanced between positive and negative sentiments to ensure fair evaluation.

## Usage

After setup, you can:

1. Modify the prompt in `promptfooconfig.yaml`
2. Adjust sample sizes in `prepare_data.py`
3. Run new evaluations with `promptfoo eval`
4. View results in the promptfoo web interface

## Notes

- The dataset is sampled to keep evaluation costs manageable
- Positive/negative labels are converted to text for better readability
- The F1 score implementation handles edge cases (division by zero)
