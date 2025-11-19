# bert-score (BERTScore Evaluation)

Use BERTScore to measure semantic similarity between LLM outputs and reference text.

```bash
npx promptfoo@latest init --example bert-score
```

## Setup

```bash
pip install -r requirements.txt
```

Note: First run will download the BERT model (~1.4GB).

## Usage

### Basic Example

```yaml
# promptfooconfig.yaml
tests:
  - vars:
      text: 'Hello world'
      reference: 'Hi there'
    assert:
      - type: python
        value: file://bertscore_check.py
        threshold: 0.7 # Pass if similarity > 70%
```

Run: `promptfoo eval`

### Advanced Example

Compare against multiple valid references:

```yaml
# promptfooconfig-advanced.yaml
assert:
  - type: python
    value: |
      from bert_score import score
      references = [
          "First valid answer",
          "Second valid answer",
          "Third valid answer"
      ]
      scores = []
      for ref in references:
          _, _, F1 = score([output], [ref], lang='en', verbose=False)
          scores.append(F1.item())
      return max(scores)  # Use best match
```

Run: `promptfoo eval -c promptfooconfig-advanced.yaml`

## How It Works

BERTScore returns a similarity score from 0 to 1:

- 0.9+ = Nearly identical meaning
- 0.7-0.9 = Similar meaning
- <0.7 = Different meaning

[Learn more](https://arxiv.org/abs/1904.09675)
