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

## Prompty Files (Microsoft Format)

Prompty is a file format developed by Microsoft for defining LLM prompts with metadata. Promptfoo supports `.prompty` files, allowing you to:

- Define prompts with YAML frontmatter containing metadata and model configuration
- Use role-based content sections (system, user, assistant, function)
- Include sample data that serves as default variable values
- Configure model-specific settings

### Basic Example

```prompty title="customer_service.prompty"
---
name: Customer Service Assistant
description: A helpful customer service agent
model:
  api: chat
  configuration:
    type: openai
    model: gpt-3.5-turbo
  parameters:
    temperature: 0.7
    max_tokens: 500
sample:
  customer_name: "John"
  issue: "billing question"
---
system:
You are a friendly customer service representative for {{company}}.
Help customers with their inquiries professionally and empathetically.

user:
Hi, I'm {{customer_name}} and I have a {{issue}}.
```

### Template Engine

Prompty files use **Nunjucks** templating (Jinja2-compatible) for variable substitution. This includes:

- Variable interpolation: `{{variable}}`
- Conditionals: `{% if condition %}...{% endif %}`
- Loops: `{% for item in items %}...{% endfor %}`

Note: While Nunjucks is largely compatible with Jinja2, there may be minor differences in some advanced features.

### Environment Variables

You can reference environment variables in the configuration using `${env:VAR_NAME}` syntax:

```prompty
---
name: Secure API Example
model:
  api: chat
  configuration:
    type: azure_openai
    api_key: ${env:AZURE_OPENAI_API_KEY}
    azure_endpoint: ${env:AZURE_OPENAI_ENDPOINT}
    azure_deployment: gpt-4
---
```

### Chat vs Completion API

Prompty supports both chat and completion APIs:

```prompty title="chat_example.prompty"
---
model:
  api: chat
---
system:
System message here

user:
User message here
```

```prompty title="completion_example.prompty"
---
model:
  api: completion
---
Complete this story: {{beginning}}
```

### Model Configuration

#### Azure OpenAI

```prompty
model:
  configuration:
    type: azure_openai
    azure_endpoint: https://myresource.openai.azure.com
    azure_deployment: gpt-4
    api_version: 2024-02-01
    api_key: ${env:AZURE_OPENAI_API_KEY}
```

#### OpenAI

```prompty
model:
  configuration:
    type: openai
    model: gpt-4
    organization: org-123
    api_key: ${env:OPENAI_API_KEY}
```

### Sample Data

The `sample` section provides default values for variables:

```prompty
---
sample:
  name: "Alice"
  topic: "machine learning"
---
user:
Hi {{name}}, can you explain {{topic}}?
```

### Multi-turn Conversations

```prompty
---
model:
  api: chat
---
system:
You are a helpful tutor.

user:
What is recursion?

assistant:
Recursion is a programming technique where a function calls itself.

user:
Can you give me an example?
```

### Image Support

Include images using markdown syntax:

```prompty
user:
What's in this image?
![Image description](https://example.com/image.jpg)
```

### Advanced Features

- **Template Processing**: Uses Nunjucks templating (Jinja2-compatible)
- **Configuration Merging**: Model parameters are merged with provider configurations
- **Multiple Prompts**: Use glob patterns to load multiple prompty files: `file://prompts/*.prompty`

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
