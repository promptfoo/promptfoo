---
title: Python & Jupyter Integration
description: Use promptfoo in Jupyter notebooks, Google Colab, Python scripts, and pytest for LLM evaluation and testing
sidebar_label: Python & Jupyter
keywords: [python, jupyter, google colab, pytest, llm evaluation, notebook]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Python & Jupyter Integration

Run promptfoo evaluations in Jupyter notebooks, Python scripts, and test suites.

**Use cases:**

- Compare models in data science workflows
- Integrate LLM testing into Python applications
- Evaluate your Python code against LLM providers
- Automate prompt testing with pytest

## Example

**[View on GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/colab-notebook)** • **[Run in Colab](https://colab.research.google.com/github/promptfoo/promptfoo/blob/main/examples/colab-notebook/promptfoo_example.ipynb)**

## Setup

<Tabs>
  <TabItem value="colab" label="Google Colab" default>

```python
# Install Node.js + promptfoo (required)
!curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
!sudo apt-get install -y nodejs
!npx promptfoo@latest init

# Set API key from Colab secrets
import os
from google.colab import userdata
os.environ['OPENAI_API_KEY'] = userdata.get('OPENAI_API_KEY')
```

  </TabItem>
  <TabItem value="local" label="Local Environment">

```bash
# Install promptfoo
npm install -g promptfoo
```

```python
# Set API key
import os
os.environ['OPENAI_API_KEY'] = 'your-api-key'
```

  </TabItem>
</Tabs>

## Basic Workflow

**1. Create configuration:**

```yaml title="promptfooconfig.yaml"
prompts: ['Translate to French: {{input}}']
providers: [openai:gpt-4o, openai:gpt-4o-mini]
tests:
  - vars: { input: 'Hello world' }
    assert: [{ type: contains, value: 'bonjour' }]
```

**2. Run evaluation:**

<Tabs>
  <TabItem value="notebook" label="Notebook" default>

```python
!npx promptfoo eval
```

  </TabItem>
  <TabItem value="terminal" label="Terminal">

```bash
npx promptfoo eval
```

  </TabItem>
</Tabs>

**3. View results:**

```python
!npx promptfoo share --yes
```

## Python API

### Direct Evaluation

```python
import promptfoo

results = await promptfoo.evaluate({
    'providers': ['openai:gpt-4o-mini'],
    'prompts': ['Translate to French: {{input}}'],
    'tests': [{'vars': {'input': 'Hello'}}]
})

print(f"Passed: {results['summary']['numPassed']}")
```

### Compare Your Code vs LLMs

```python title="my_translator.py"
import sys
# Your custom logic here
print(f"Mon traduction: {sys.argv[1]}")
```

```yaml title="config.yaml"
providers:
  - openai:gpt-4o-mini
  - exec:python my_translator.py
prompts: ['{{input}}']
tests: [{ vars: { input: 'Hello' } }]
```

### Automated Testing

```python title="test_prompts.py"
import pytest, promptfoo

@pytest.mark.asyncio
async def test_translation_quality():
    results = await promptfoo.evaluate({
        'providers': ['openai:gpt-4o-mini'],
        'prompts': ['Translate to French: {{input}}'],
        'tests': [{
            'vars': {'input': 'Hello'},
            'assert': [{'type': 'contains', 'value': 'bonjour'}]
        }]
    })
    assert results['summary']['numFailed'] == 0
```

Run with: `pytest test_prompts.py`

## Advanced Usage

- **[Configuration Guide](/docs/configuration/guide/)** - Complex evaluation setups
- **[Custom Providers](/docs/providers/custom-api/)** - Build custom integrations
- **[Assertions Reference](/docs/configuration/expected-outputs/)** - All available test types

:::warning Common Issues

**Node.js Required**: promptfoo needs Node.js even in Python environments  
**API Keys**: Set `OPENAI_API_KEY` environment variable correctly

:::

**Questions?** [Documentation](/docs/) • [Discord](https://discord.gg/gHPS9jjfbs)
