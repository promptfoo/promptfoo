---
sidebar_position: 3
sidebar_label: Overview
title: Configuration Overview - Prompts, Tests, and Outputs
description: Quick overview of promptfoo's core configuration concepts including prompts, test cases, outputs, and common patterns for LLM evaluation.
keywords:
  [
    promptfoo overview,
    configuration basics,
    prompt setup,
    test cases,
    output formats,
    evaluation workflow,
  ]
pagination_prev: configuration/reference
pagination_next: configuration/prompts
---

# Prompts, tests, and outputs

Configure how promptfoo evaluates your LLM applications.

## Quick Start

```yaml title="promptfooconfig.yaml"
# Define your prompts
prompts:
  - 'Translate to {{language}}: {{text}}'

# Configure test cases
tests:
  - vars:
      language: French
      text: Hello world
    assert:
      - type: contains
        value: Bonjour
# Run evaluation
# promptfoo eval
```

## Core Concepts

### 📝 [Prompts](/docs/configuration/prompts)

Define what you send to your LLMs - from simple strings to complex conversations.

<details>
<summary><strong>Common patterns</strong></summary>

**Text prompts**

```yaml
prompts:
  - 'Summarize this: {{content}}'
  - file://prompts/customer_service.txt
```

**Chat conversations**

```yaml
prompts:
  - file://prompts/chat.json
```

**Dynamic prompts**

```yaml
prompts:
  - file://generate_prompt.js
  - file://create_prompt.py
```

</details>

[Learn more about prompts →](/docs/configuration/prompts)

### 🧪 [Test Cases](/docs/configuration/test-cases)

Configure evaluation scenarios with variables and assertions.

<details>
<summary><strong>Common patterns</strong></summary>

**Inline tests**

```yaml
tests:
  - vars:
      question: "What's 2+2?"
    assert:
      - type: equals
        value: '4'
```

**CSV test data**

```yaml
tests: file://test_cases.csv
```

**HuggingFace datasets**

```yaml
tests: huggingface://datasets/rajpurkar/squad
```

**Dynamic generation**

```yaml
tests: file://generate_tests.js
```

</details>

[Learn more about test cases →](/docs/configuration/test-cases)

### 📊 [Output Formats](/docs/configuration/outputs)

Save and analyze your evaluation results.

<details>
<summary><strong>Available formats</strong></summary>

```bash
# Visual report
promptfoo eval --output results.html

# Data analysis
promptfoo eval --output results.json

# Spreadsheet
promptfoo eval --output results.csv
```

</details>

[Learn more about outputs →](/docs/configuration/outputs)

## Complete Example

Here's a real-world example that combines multiple features:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Customer service chatbot evaluation

prompts:
  # Simple text prompt
  - 'You are a helpful customer service agent. {{query}}'

  # Chat conversation format
  - file://prompts/chat_conversation.json

  # Dynamic prompt with logic
  - file://prompts/generate_prompt.js

providers:
  - openai:gpt-4.1-mini
  - anthropic:claude-3-haiku

tests:
  # Inline test cases
  - vars:
      query: 'I need to return a product'
    assert:
      - type: contains
        value: 'return policy'
      - type: llm-rubric
        value: 'Response is helpful and professional'

  # Load more tests from CSV
  - file://test_scenarios.csv

# Save results
outputPath: evaluations/customer_service_results.html
```

## Quick Reference

### Supported File Formats

| Format               | Prompts | Tests | Use Case                            |
| -------------------- | ------- | ----- | ----------------------------------- |
| `.txt`               | ✅      | ❌    | Simple text prompts                 |
| `.json`              | ✅      | ✅    | Chat conversations, structured data |
| `.yaml`              | ✅      | ✅    | Complex configurations              |
| `.csv`               | ✅      | ✅    | Bulk data, multiple variants        |
| `.js`/`.ts`          | ✅      | ✅    | Dynamic generation with logic       |
| `.py`                | ✅      | ✅    | Python-based generation             |
| `.md`                | ✅      | ❌    | Markdown-formatted prompts          |
| `.j2`                | ✅      | ❌    | Jinja2 templates                    |
| HuggingFace datasets | ❌      | ✅    | Import from existing datasets       |

### Variable Syntax

Variables use [Nunjucks](https://mozilla.github.io/nunjucks/) templating:

```yaml
# Basic substitution
prompt: "Hello {{name}}"

# Filters
prompt: "URGENT: {{message | upper}}"

# Conditionals
prompt: "{% if premium %}Premium support: {% endif %}{{query}}"
```

### File References

All file paths are relative to the config file:

```yaml
# Single file
prompts:
  - file://prompts/main.txt

# Multiple files with glob
tests:
  - file://tests/*.yaml

# Specific function
prompts:
  - file://generate.js:createPrompt
```

Wildcards like `path/to/prompts/**/*.py:func_name` are also supported.

## Next Steps

- **[Prompts](/docs/configuration/prompts)** - Deep dive into prompt configuration
- **[Test Cases](/docs/configuration/test-cases)** - Learn about test scenarios and assertions
- **[HuggingFace Datasets](/docs/configuration/huggingface-datasets)** - Import test cases from existing datasets
- **[Output Formats](/docs/configuration/outputs)** - Understand evaluation results
- **[Expected Outputs](/docs/configuration/expected-outputs)** - Configure assertions
- **[Configuration Reference](/docs/configuration/reference)** - All configuration options
