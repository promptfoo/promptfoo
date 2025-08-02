---
sidebar_label: Migrating from RAGAS
---

# Migrating from RAGAS to Promptfoo

This guide helps you migrate noise sensitivity evaluations from RAGAS to promptfoo. Our implementation is fully compatible with RAGAS, providing identical results with additional features.

## Quick Comparison

| Feature | RAGAS | Promptfoo |
|---------|-------|-----------|
| Noise sensitivity metric | ✅ | ✅ |
| Labeled context chunks | ✅ | ✅ |
| Relevant/Irrelevant modes | ✅ | ✅ |
| Same scoring algorithm | ✅ | ✅ |
| YAML configuration | ❌ | ✅ |
| Built-in caching | ❌ | ✅ |
| Web UI for results | ❌ | ✅ |

## Migration Steps

### 1. Convert RAGAS Python Code

**RAGAS (Python):**
```python
from ragas.metrics import NoiseSensitivity
from ragas.dataset_schema import SingleTurnSample

# Configure metric
noise_sensitivity = NoiseSensitivity(mode="irrelevant")

# Create sample
sample = SingleTurnSample(
    user_input="What is the capital of France?",
    response="The capital of France is Paris. Berlin is the capital of Germany.",
    reference="The capital of France is Paris.",
    retrieved_contexts=[
        "Paris is the capital of France.",
        "Berlin is the capital of Germany."
    ]
)

# Evaluate
score = await noise_sensitivity.score(sample)
```

**Promptfoo (YAML):**
```yaml
providers:
  - openai:gpt-4

tests:
  - vars:
      query: "What is the capital of France?"
      contextChunks:
        - text: "Paris is the capital of France."
          relevant: true
        - text: "Berlin is the capital of Germany."
          relevant: false
    assert:
      - type: noise-sensitivity
        value: "The capital of France is Paris."  # reference/ground truth
        threshold: 0.2
        config:
          mode: irrelevant
          contextChunks: '{{contextChunks}}'
```

### 2. Map RAGAS Concepts to Promptfoo

| RAGAS | Promptfoo | Notes |
|-------|-----------|-------|
| `user_input` | `vars.query` | The question asked |
| `response` | Provider output | What the LLM generates |
| `reference` | `assert.value` | Ground truth answer |
| `retrieved_contexts` | `contextChunks` | Array of context chunks |
| Context relevance | `chunk.relevant` | Boolean flag per chunk |
| `mode` | `config.mode` | 'relevant' or 'irrelevant' |

### 3. Handle Context Chunks

RAGAS requires separate tracking of context relevance. In promptfoo, this is built into the chunk structure:

```yaml
contextChunks:
  - text: "Relevant information"
    relevant: true
  - text: "Irrelevant noise"
    relevant: false
```

### 4. Run Evaluations

**RAGAS:**
```bash
python evaluate_ragas.py
```

**Promptfoo:**
```bash
npx promptfoo eval
```

## Advanced Features

### Batch Evaluation

Promptfoo can evaluate multiple test cases in parallel:

```yaml
tests:
  - description: "Test case 1"
    vars:
      query: "..."
      contextChunks: [...]
    
  - description: "Test case 2"
    vars:
      query: "..."
      contextChunks: [...]
```

### Multiple Assertions

Test noise sensitivity alongside other metrics:

```yaml
assert:
  - type: noise-sensitivity
    threshold: 0.2
  - type: context-faithfulness
    threshold: 0.8
  - type: context-relevance
    threshold: 0.7
```

### Caching and Performance

Promptfoo automatically caches LLM calls:

```bash
# First run - makes LLM calls
npx promptfoo eval

# Subsequent runs - uses cache
npx promptfoo eval

# Force fresh evaluation
npx promptfoo eval --no-cache
```

## Complete Example

Here's a full migration example:

**Original RAGAS Test:**
```python
# test_ragas.py
import asyncio
from ragas.metrics import NoiseSensitivity
from datasets import Dataset

async def evaluate():
    metric_relevant = NoiseSensitivity(mode="relevant")
    metric_irrelevant = NoiseSensitivity(mode="irrelevant")
    
    data = {
        "user_input": ["What is Python used for?"],
        "response": ["Python is used for data science. Ruby is used for web development."],
        "reference": ["Python is used for data science and machine learning."],
        "retrieved_contexts": [[
            "Python is popular for data science.",
            "Ruby is used for web development."
        ]],
        "context_relevance": [[True, False]]
    }
    
    dataset = Dataset.from_dict(data)
    
    score_relevant = await metric_relevant.score(dataset)
    score_irrelevant = await metric_irrelevant.score(dataset)
    
    print(f"Relevant mode: {score_relevant}")
    print(f"Irrelevant mode: {score_irrelevant}")

asyncio.run(evaluate())
```

**Migrated to Promptfoo:**
```yaml
# promptfooconfig.yaml
providers:
  - openai:gpt-4o-mini

prompts:
  - "Answer: {{output}}"  # Echo provider for testing

tests:
  - vars:
      query: "What is Python used for?"
      output: "Python is used for data science. Ruby is used for web development."
      contextChunks:
        - text: "Python is popular for data science."
          relevant: true
        - text: "Ruby is used for web development."
          relevant: false
          
    assert:
      # Test both modes
      - type: noise-sensitivity
        value: "Python is used for data science and machine learning."
        threshold: 0.5
        config:
          mode: relevant
          contextChunks: '{{contextChunks}}'
          
      - type: noise-sensitivity
        value: "Python is used for data science and machine learning."
        threshold: 0.5
        config:
          mode: irrelevant
          contextChunks: '{{contextChunks}}'
```

Run with:
```bash
npx promptfoo eval
```

## Verification

Both RAGAS and promptfoo will produce identical scores:
- Extract same claims
- Check correctness the same way
- Apply same mode logic
- Calculate same final score

The algorithm is: `noise_sensitivity = incorrect_claims_subset / total_claims`

Where:
- Relevant mode: subset = ALL incorrect claims
- Irrelevant mode: subset = incorrect claims from irrelevant chunks

## Benefits of Promptfoo

1. **No code required** - Pure YAML configuration
2. **Visual results** - Web UI with detailed breakdowns
3. **Faster iteration** - Built-in caching
4. **Multiple providers** - Test across different LLMs
5. **CI/CD ready** - Easy to integrate into pipelines

## Getting Help

- [Noise Sensitivity Documentation](/docs/configuration/expected-outputs/model-graded/noise-sensitivity)
- [Promptfoo Discord](https://discord.gg/promptfoo)
- [GitHub Issues](https://github.com/promptfoo/promptfoo/issues)