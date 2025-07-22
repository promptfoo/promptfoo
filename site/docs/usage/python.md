---
sidebar_label: Python
title: Using Promptfoo with Python - Complete Guide
description: Comprehensive guide for using Promptfoo in Python projects, Jupyter notebooks, and Python-based AI frameworks
keywords: [promptfoo, python, langchain, crewai, jupyter, colab, llm evaluation, ai testing]
---

# Using Promptfoo with Python

Promptfoo seamlessly integrates with Python workflows, from Jupyter notebooks to production AI applications. This guide covers all the ways to leverage Promptfoo in your Python projects.

## Installation

```bash
# Install globally
npm install -g promptfoo

# Or run directly with npx
npx promptfoo@latest eval
```

For Python notebooks:

```python
# In Jupyter/Colab
!npm install -g promptfoo
```

## Python Integration Overview

Promptfoo supports Python in four main ways:

1. **[Custom Providers](/docs/providers/python)** - Build LLM providers in Python
2. **[Python Assertions](/docs/configuration/expected-outputs/python)** - Validate outputs with Python
3. **Dynamic Test Generation** - Generate tests programmatically
4. **Framework Integration** - Evaluate LangChain, CrewAI, and other Python AI apps

## Getting Started in Python

### Running from Command Line

```bash
# Run evaluation with Python provider
promptfoo eval -c promptfooconfig.yaml

# Use Python for test generation
promptfoo eval -c config.yaml -t generate_tests.py
```

### Running from Python Scripts

```python
import subprocess
import json

# Run evaluation and capture results
result = subprocess.run(
    ['promptfoo', 'eval', '-c', 'config.yaml', '-o', 'results.json'],
    capture_output=True,
    text=True
)

# Load and analyze results
with open('results.json') as f:
    data = json.load(f)
    print(f"Pass rate: {data['summary']['passRate']}%")
```

### Jupyter Notebook Integration

View our [interactive Colab example](https://colab.research.google.com/gist/typpo/734a5f53eb1922f90198538dbe17aa27/promptfoo-example-1.ipynb) or create your own:

```python
# Cell 1: Install and configure
!npm install -g promptfoo
import os
os.environ['OPENAI_API_KEY'] = 'your-key-here'

# Cell 2: Create configuration
config = """
providers:
  - openai:gpt-4o-mini

prompts:
  - "Explain {{topic}} in simple terms"

tests:
  - vars:
      topic: quantum computing
    assert:
      - type: contains
        value: "quantum"
"""

with open('promptfooconfig.yaml', 'w') as f:
    f.write(config)

# Cell 3: Run evaluation
!promptfoo eval
```

## Python-Based Providers

Create custom model integrations:

```python
# custom_model.py
def call_api(prompt, options, context):
    # Your model logic here
    response = your_model.generate(prompt)
    return {"output": response}
```

```yaml
# promptfooconfig.yaml
providers:
  - id: python:custom_model.py
```

[Learn more about Python providers →](/docs/providers/python)

## Python Assertions

Validate outputs with custom logic:

```python
# validate.py
def get_assert(output, context):
    # Return True if valid, False otherwise
    return len(output) > 100 and "error" not in output.lower()
```

```yaml
assert:
  - type: python
    value: file://validate.py
```

[Learn more about Python assertions →](/docs/configuration/expected-outputs/python)

## Framework Integrations

### LangChain

Evaluate chains and agents built with LangChain:

- [LangChain Math Example](https://github.com/promptfoo/promptfoo/tree/main/examples/langchain-python)
- [Red Team LangChain Apps](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-langchain)

### CrewAI

Test multi-agent systems:

- [CrewAI Evaluation Guide](/docs/guides/evaluate-crewai)
- [CrewAI Example](https://github.com/promptfoo/promptfoo/tree/main/examples/crewai)

### PydanticAI

Structured output validation:

- [PydanticAI Example](https://github.com/promptfoo/promptfoo/tree/main/examples/pydantic-ai)

## Common Python Patterns

### Dynamic Test Generation

```python
# generate_tests.py
import pandas as pd

df = pd.read_csv('test_cases.csv')
tests = []

for _, row in df.iterrows():
    tests.append({
        'vars': {'input': row['input']},
        'assert': [{'type': 'equals', 'value': row['expected']}]
    })

print(json.dumps(tests))
```

### Environment Setup

```bash
# Use specific Python version
export PROMPTFOO_PYTHON=/usr/bin/python3.11

# Enable debugging
export PROMPTFOO_PYTHON_DEBUG_ENABLED=1
```

### Async Functions

```python
# async_provider.py
import asyncio

async def call_api(prompt, options, context):
    result = await async_model_call(prompt)
    return {"output": result}
```

## Examples by Use Case

### Testing & Validation

- [Python Assertions](https://github.com/promptfoo/promptfoo/tree/main/examples/python-assert)
- [Custom Scoring](https://github.com/promptfoo/promptfoo/tree/main/examples/assertion-scoring-override)
- [Agent Safety](https://github.com/promptfoo/promptfoo/tree/main/examples/agent-safety-guardrail)

### Data Processing

- [RAG Pipeline](https://github.com/promptfoo/promptfoo/tree/main/examples/rag-full)
- [Transform Functions](https://github.com/promptfoo/promptfoo/tree/main/examples/transform-file)
- [Dynamic Variables](https://github.com/promptfoo/promptfoo/tree/main/examples/dynamic-var)

### Model Integration

- [Custom Providers](https://github.com/promptfoo/promptfoo/tree/main/examples/python-provider)
- [SageMaker Models](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-sagemaker)
- [HuggingFace Models](https://github.com/promptfoo/promptfoo/tree/main/examples/huggingface-hle)

### Agent Evaluation

- [OpenAI Agents](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents)
- [Time-Based Testing](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents-time-bypass)
- [Multi-Agent Systems](https://github.com/promptfoo/promptfoo/tree/main/examples/crewai)

## Best Practices

1. **Dependencies**: Use `requirements.txt` for reproducible environments
2. **Paths**: Use absolute paths or `file://` protocol for Python scripts
3. **Error Handling**: Return proper error objects: `{"error": "message"}`
4. **Performance**: Use async functions for I/O-bound operations
5. **Security**: Never hardcode API keys; use environment variables

## Troubleshooting

| Issue             | Solution                                          |
| ----------------- | ------------------------------------------------- |
| Module not found  | Check `PYTHONPATH` and virtual environment        |
| Permission denied | Ensure scripts have execute permissions           |
| Async errors      | Match async/await usage in your functions         |
| Import errors     | Verify package installation in active environment |

## Next Steps

- **[Python Provider Tutorial](/docs/providers/python)** - Deep dive into custom providers
- **[Configuration Guide](/docs/configuration/guide)** - Full configuration reference
- **[Examples](https://github.com/promptfoo/promptfoo/tree/main/examples)** - Browse all Python examples
- **[Discord Community](https://discord.gg/promptfoo)** - Get help from the community
