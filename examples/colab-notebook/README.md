# colab-notebook (Jupyter/Colab Python Integration)

You can run this example with:

```bash
npx promptfoo@latest init --example colab-notebook
```

This comprehensive example demonstrates **promptfoo's full Python integration capabilities** in a Jupyter/Google Colab notebook.

## What's Included

This notebook covers:

1. **Basic Setup** - Installing and configuring Promptfoo in notebooks
2. **Custom Python Providers** - Create LLM providers in pure Python
3. **Python Assertions** - Advanced output validation with Python functions
4. **Dynamic Test Generation** - Generate tests from CSV/databases
5. **Framework Integration** - LangChain, CrewAI, and other Python AI libraries
6. **Red Team Testing** - Security and safety evaluation
7. **RAG Evaluation** - Test retrieval-augmented generation systems

## Prerequisites

- Google Colab account (free tier is sufficient) or local Jupyter environment
- API keys for LLM providers:
  - `OPENAI_API_KEY` - Get from [OpenAI API keys page](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/) (optional)

## Quick Start

### Option 1: Google Colab (Recommended)
Open [promptfoo_example.ipynb](./promptfoo_example.ipynb) in Google Colab and run each cell sequentially.

### Option 2: Local Jupyter
```bash
# Install Jupyter
pip install jupyter

# Start Jupyter
jupyter notebook promptfoo_example.ipynb
```

## Key Features Demonstrated

### Custom Python Providers
```python
def call_api(prompt, options, context):
    # Your custom model logic here
    return {"output": response}
```

### Python Assertions
```python
def get_assert(output, context):
    # Complex validation logic
    return {"pass": True, "score": 0.95, "reason": "..."}
```

### Dynamic Test Generation
```python
# Generate tests from data sources
tests = []
for row in dataset:
    tests.append({
        'vars': {...},
        'assert': [...]
    })
```

## Expected Results

The notebook will:

- Install and configure Promptfoo in your Python environment
- Demonstrate custom provider creation for any Python-based model
- Show advanced assertion techniques for output validation
- Generate test cases programmatically from data
- Compare LangChain implementations with vanilla LLMs
- Perform security testing with red team strategies
- Evaluate RAG systems for accuracy and hallucination

## Learn More

- [Python Provider Documentation](https://www.promptfoo.dev/docs/providers/python)
- [Python Assertions Guide](https://www.promptfoo.dev/docs/configuration/expected-outputs/python)
- [Full Python Usage Guide](https://www.promptfoo.dev/docs/usage/python)
- [More Python Examples](https://github.com/promptfoo/promptfoo/tree/main/examples)
