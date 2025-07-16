---
sidebar_position: 11
sidebar_label: Prompts
title: Prompt Configuration - Text, Chat, and Dynamic Prompts
description: Configure prompts for LLM evaluation including text prompts, chat conversations, file-based prompts, and dynamic prompt generation with variables.
keywords:
  [
    prompt configuration,
    LLM prompts,
    chat conversations,
    dynamic prompts,
    template variables,
    prompt engineering,
  ]
pagination_prev: configuration/parameters
pagination_next: configuration/test-cases
---

# Prompt Configuration

Define what you send to your LLMs - from simple strings to complex multi-turn conversations.

## Text Prompts

The simplest way to define prompts is with plain text:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Translate the following text to French: "{{text}}"'
  - 'Summarize this article: {{article}}'
```

### Multiline Prompts

Use YAML's multiline syntax for longer prompts:

```yaml title="promptfooconfig.yaml"
prompts:
  - |-
    You are a helpful assistant.

    Please answer the following question:
    {{question}}

    Provide a detailed explanation.
```

### Variables and Templates

Prompts use [Nunjucks](https://mozilla.github.io/nunjucks/) templating:

```yaml
prompts:
  - 'Hello {{name}}, welcome to {{company}}!'
  - 'Product: {{product | upper}}' # Using filters
  - '{% if premium %}Priority support: {% endif %}{{issue}}' # Conditionals
```

## File-Based Prompts

Store prompts in external files for better organization:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://prompts/customer_service.txt
  - file://prompts/technical_support.txt
```

```txt title="prompts/customer_service.txt"
You are a friendly customer service representative for {{company}}.

Customer query: {{query}}

Please provide a helpful and professional response.
```

### Supported File Formats

#### Text Files (.txt)

Simple text prompts with variable substitution.

#### Markdown Files (.md)

```markdown title="prompt.md"
# System Instructions

You are an AI assistant for {{company}}.

## Your Task

{{task}}
```

#### Jinja2 Templates (.j2)

```jinja title="prompt.j2"
You are assisting with {{ topic }}.
{% if advanced_mode %}
Provide technical details and code examples.
{% else %}
Keep explanations simple and clear.
{% endif %}
```

### Multiple Prompts in One File

Separate multiple prompts with `---`:

```text title="prompts.txt"
Translate to French: {{text}}
---
Translate to Spanish: {{text}}
---
Translate to German: {{text}}
```

### Using Globs

Load multiple files with glob patterns:

```yaml
prompts:
  - file://prompts/*.txt
  - file://scenarios/**/*.json
```

Wildcards like `path/to/prompts/**/*.py:func_name` are also supported.

## Chat Format (JSON)

For conversation-style interactions, use JSON format:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://chat_prompt.json
```

```json title="chat_prompt.json"
[
  {
    "role": "system",
    "content": "You are a helpful coding assistant."
  },
  {
    "role": "user",
    "content": "Write a function to {{task}}"
  }
]
```

### Multi-Turn Conversations

```json title="conversation.json"
[
  {
    "role": "system",
    "content": "You are a tutoring assistant."
  },
  {
    "role": "user",
    "content": "What is recursion?"
  },
  {
    "role": "assistant",
    "content": "Recursion is a programming technique where a function calls itself."
  },
  {
    "role": "user",
    "content": "Can you show me an example in {{language}}?"
  }
]
```

## Dynamic Prompts (Functions)

Use JavaScript or Python to generate prompts with custom logic:

### JavaScript Functions

```yaml title="promptfooconfig.yaml"
prompts:
  - file://generate_prompt.js
```

```javascript title="generate_prompt.js"
module.exports = async function ({ vars, provider }) {
  // Access variables and provider info
  const topic = vars.topic;
  const complexity = vars.complexity || 'medium';

  // Build prompt based on logic
  if (complexity === 'simple') {
    return `Explain ${topic} in simple terms.`;
  } else {
    return `Provide a detailed explanation of ${topic} with examples.`;
  }
};
```

### Python Functions

```yaml title="promptfooconfig.yaml"
prompts:
  - file://generate_prompt.py:create_prompt
```

```python title="generate_prompt.py"
def create_prompt(context):
    vars = context['vars']
    provider = context['provider']

    # Dynamic prompt generation
    if vars.get('technical_audience'):
        return f"Provide a technical analysis of {vars['topic']}"
    else:
        return f"Explain {vars['topic']} for beginners"
```

### Function with Configuration

Return both prompt and provider configuration:

```javascript title="prompt_with_config.js"
module.exports = async function ({ vars }) {
  const complexity = vars.complexity || 'medium';

  return {
    prompt: `Analyze ${vars.topic}`,
    config: {
      temperature: complexity === 'creative' ? 0.9 : 0.3,
      max_tokens: complexity === 'detailed' ? 1000 : 200,
    },
  };
};
```

## Model-Specific Prompts

Different prompts for different providers:

```yaml title="promptfooconfig.yaml"
prompts:
  - id: file://prompts/gpt_prompt.json
    label: gpt_prompt
  - id: file://prompts/claude_prompt.txt
    label: claude_prompt

providers:
  - id: openai:gpt-4
    prompts: [gpt_prompt]
  - id: anthropic:claude-3
    prompts: [claude_prompt]
```

## CSV Prompts

Define multiple prompts in CSV format:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://prompts.csv
```

```csv title="prompts.csv"
prompt,label
"Translate to French: {{text}}","French Translation"
"Translate to Spanish: {{text}}","Spanish Translation"
"Translate to German: {{text}}","German Translation"
```

## External Prompt Management Systems

Promptfoo integrates with external prompt management platforms, allowing you to centralize and version control your prompts:

### Langfuse

[Langfuse](/docs/integrations/langfuse) is an open-source LLM engineering platform with collaborative prompt management:

```yaml
prompts:
  # Reference by version (numeric values)
  - langfuse://my-prompt:3:text
  - langfuse://chat-prompt:1:chat

  # Reference by label using @ syntax (recommended for clarity)
  - langfuse://my-prompt@production
  - langfuse://chat-prompt@staging:chat
  - langfuse://email-template@latest:text

  # Reference by label using : syntax (auto-detected strings)
  - langfuse://my-prompt:production # String detected as label
  - langfuse://chat-prompt:staging:chat # String detected as label
```

### Portkey

[Portkey](/docs/integrations/portkey) provides AI observability with prompt management capabilities:

```yaml
prompts:
  - portkey://pp-customer-support-v2
  - portkey://pp-email-generator-prod
```

### Helicone

[Helicone](/docs/integrations/helicone) offers prompt management alongside observability features:

```yaml
prompts:
  - helicone://greeting-prompt:1.0
  - helicone://support-chat:2.5
```

Variables from your test cases are automatically passed to these external prompts.

## Advanced Features

### Custom Nunjucks Filters

Create custom filters for prompt processing:

```js title="uppercase_first.js"
module.exports = function (str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
};
```

```yaml title="promptfooconfig.yaml"
nunjucksFilters:
  uppercaseFirst: ./uppercase_first.js

prompts:
  - 'Dear {{ name | uppercaseFirst }}, {{ message }}'
```

### Prompt Labels and IDs

Organize prompts with labels:

```yaml
prompts:
  - id: file://customer_prompt.txt
    label: 'Customer Service'
  - id: file://technical_prompt.txt
    label: 'Technical Support'
```

### Default Prompt

If no prompts are specified, promptfoo uses `{{prompt}}` as a passthrough.

## Best Practices

1. **Start Simple**: Use inline text for basic use cases
2. **Organize Complex Prompts**: Move longer prompts to files
3. **Use Version Control**: Track prompt files in Git
4. **Leverage Templates**: Use variables for reusable prompts
5. **Test Variations**: Create multiple versions to compare performance

## Common Patterns

### System + User Message

```json
[
  { "role": "system", "content": "You are {{role}}" },
  { "role": "user", "content": "{{query}}" }
]
```

### Few-Shot Examples

```yaml
prompts:
  - |-
    Classify the sentiment:

    Text: "I love this!" → Positive
    Text: "This is terrible" → Negative
    Text: "{{text}}" →
```

### Chain of Thought

```yaml
prompts:
  - |-
    Question: {{question}}

    Let's think step by step:
    1. First, identify what we know
    2. Then, determine what we need to find
    3. Finally, solve the problem

    Answer:
```

## Viewing Final Prompts

To see the final rendered prompts:

1. Run `promptfoo view`
2. Enable **Table Settings** > **Show full prompt in output cell**

This shows exactly what was sent to each provider after variable substitution.
