---
title: Python Integration
sidebar_label: Python
sidebar_position: 1
description: Use Python for promptfoo evals - providers, assertions, test generators, and prompts. Integrates with LangChain, LangGraph, CrewAI, and more.
keywords:
  [
    promptfoo python,
    python llm testing,
    python eval,
    python provider,
    langchain testing,
    langgraph testing,
    python llm eval,
    test llm python,
    crewai testing,
    pydantic ai testing,
    openai agents sdk,
    google adk,
    strands agents,
    python agent framework,
  ]
---

import PythonFileViewer from '@site/src/components/PythonFileViewer';

# Python

Promptfoo is written in TypeScript and runs via Node.js, but it has first-class Python support. You can use Python for any part of your eval pipeline without writing JavaScript.

**Use Python for:**

- [**Providers**](#providers): call custom models, wrap APIs, run Hugging Face/PyTorch
- [**Assertions**](#assertions): validate outputs with custom scoring logic
- [**Test generators**](#test-generators): load test cases from databases, APIs, or generate them programmatically
- [**Prompts**](#prompts): build prompts dynamically based on test variables
- [**Framework integrations**](#framework-integrations): test LangChain, LangGraph, CrewAI, and other agent frameworks

The `file://` prefix tells promptfoo to execute a Python function. Promptfoo automatically detects your Python installation.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompts.py:create_prompt # Python generates the prompt

providers:
  - file://provider.py # Python calls the model

tests:
  - file://tests.py:generate_tests # Python generates test cases

defaultTest:
  assert:
    - type: python # Python validates the output
      value: file://assert.py:check
```

<!-- prettier-ignore-start -->
<PythonFileViewer
  defaultOpen="provider.py"
  files={[
    {
      name: 'prompts.py',
      description: 'Generate prompts',
      content: `def create_prompt(context):
    return [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": f"Explain {context['vars']['topic']}"},
    ]`,
    },
    {
      name: 'provider.py',
      description: 'Call any model',
      content: `from openai import OpenAI

client = OpenAI()

def call_api(prompt, options, context):
    response = client.responses.create(
        model="gpt-5.1-mini",
        input=prompt,
    )
    return {"output": response.output_text}`,
    },
    {
      name: 'tests.py',
      description: 'Generate tests',
      content: `def generate_tests(config=None):
    return [
        {"vars": {"topic": "decorators"}},
        {"vars": {"topic": "async/await"}},
    ]`,
    },
    {
      name: 'assert.py',
      description: 'Validate output',
      content: `def check(output, context):
    topic = context["vars"]["topic"]
    if topic.lower() not in output.lower():
        return {"pass": False, "score": 0, "reason": f"Missing: {topic}"}
    return {"pass": True, "score": 1.0}`,
    },
  ]}
/>
<!-- prettier-ignore-end -->

```bash
npx promptfoo@latest init --example python-provider
```

---

## Providers

Use `file://` to reference a Python file:

```yaml
providers:
  - file://provider.py # Uses call_api() by default
  - file://provider.py:custom_function # Specify a function name
```

Your function receives three arguments and returns a dict:

```python title="provider.py"
def call_api(prompt, options, context):  # or: async def call_api(...)
    # prompt: string or JSON-encoded messages
    # options: {"config": {...}} from YAML
    # context: {"vars": {...}} from test case

    return {
        "output": "response text",
        # Optional:
        "tokenUsage": {"total": 100, "prompt": 20, "completion": 80},
        "cost": 0.001,
    }
```

→ [Provider documentation](/docs/providers/python)

---

## Assertions

Use `type: python` to run custom validation:

```yaml
assert:
  # Inline expression (returns bool or float 0-1)
  - type: python
    value: "'keyword' in output.lower()"

  # External file
  - type: python
    value: file://assert.py
```

For external files, define a `get_assert` function:

```python title="assert.py"
def get_assert(output, context):
    # Return bool, float (0-1), or detailed result
    return {
        "pass": True,
        "score": 0.9,
        "reason": "Meets criteria",
    }
```

→ [Assertions documentation](/docs/configuration/expected-outputs/python)

---

## Test Generators

Load or generate test cases from Python:

```yaml
tests:
  - file://tests.py:generate_tests
```

```python title="tests.py"
def generate_tests(config=None):
    # Load from database, API, files, etc.
    return [
        {"vars": {"input": "test 1"}, "assert": [{"type": "contains", "value": "expected"}]},
        {"vars": {"input": "test 2"}},
    ]
```

Pass configuration from YAML:

```yaml
tests:
  - path: file://tests.py:generate_tests
    config:
      max_cases: 100
      category: 'safety'
```

→ [Test case documentation](/docs/configuration/test-cases#dynamic-test-generation)

---

## Prompts

Build prompts dynamically:

```yaml
prompts:
  - file://prompts.py:create_prompt
```

```python title="prompts.py"
def create_prompt(context):
    # Return string or chat messages
    return [
        {"role": "system", "content": "You are an expert."},
        {"role": "user", "content": f"Explain {context['vars']['topic']}"},
    ]
```

→ [Prompts documentation](/docs/configuration/prompts)

---

## Framework Integrations

Test Python agent frameworks by wrapping them as providers:

| Framework          | Example                                                                                              | Guide                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **LangGraph**      | [`langgraph`](https://github.com/promptfoo/promptfoo/tree/main/examples/langgraph)                   | [Evaluate LangGraph agents](/docs/guides/evaluate-langgraph) |
| **LangChain**      | [`langchain-python`](https://github.com/promptfoo/promptfoo/tree/main/examples/langchain-python)     | [Test LLM chains](/docs/configuration/testing-llm-chains)    |
| **CrewAI**         | [`crewai`](https://github.com/promptfoo/promptfoo/tree/main/examples/crewai)                         | [Evaluate CrewAI agents](/docs/guides/evaluate-crewai)       |
| **OpenAI Agents**  | [`openai-agents`](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents)           | [Multi-turn agent workflows](/docs/providers/openai-agents)  |
| **PydanticAI**     | [`pydantic-ai`](https://github.com/promptfoo/promptfoo/tree/main/examples/pydantic-ai)               | Type-safe agents with Pydantic                               |
| **Google ADK**     | [`google-adk-example`](https://github.com/promptfoo/promptfoo/tree/main/examples/google-adk-example) | Google Agent Development Kit                                 |
| **Strands Agents** | [`strands-agents`](https://github.com/promptfoo/promptfoo/tree/main/examples/strands-agents)         | AWS open-source agent framework                              |

To get started with any example:

```bash
npx promptfoo@latest init --example langgraph
```

---

## Jupyter / Colab

```python
# Install
!npm install -g promptfoo

# Create config
%%writefile promptfooconfig.yaml
prompts:
  - "Explain {{topic}}"
providers:
  - openai:gpt-4.1-mini
tests:
  - vars:
      topic: machine learning

# Run
!npx promptfoo eval
```

**[Open in Google Colab](https://colab.research.google.com/gist/typpo/734a5f53eb1922f90198538dbe17aa27/promptfoo-example-1.ipynb)**

---

## Configuration

### Python Path

Set a custom Python executable:

```bash
export PROMPTFOO_PYTHON=/path/to/python3
```

Or configure per-provider in YAML:

```yaml
providers:
  - id: file://provider.py
    config:
      pythonExecutable: ./venv/bin/python
```

### Module Paths

Add directories to the Python path:

```bash
export PYTHONPATH=/path/to/modules:$PYTHONPATH
```

### Debugging

Enable debug output to see Python execution details:

```bash
LOG_LEVEL=debug npx promptfoo eval
```

---

## Troubleshooting

See [Python provider troubleshooting](/docs/providers/python#troubleshooting) for common issues like `Python not found`, module import errors, and timeout problems.
