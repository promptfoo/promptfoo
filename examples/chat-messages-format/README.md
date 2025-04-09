# chat-messages-format (Chat Messages Format)

This example demonstrates how to compose prompts from multiple files with specific roles and various file formats using promptfoo's chat messages format.

## Files

- `system.j2`: Template for system message (Jinja2 format)
- `user1.j2`: Template for user message (Jinja2 format)
- `system.txt`: Plain text system prompt
- `user.md`: Markdown formatted user prompt
- `assistant.json`: JSON structured assistant response
- `prompt.js`: JavaScript function for code examples
- `promptfooconfig.yaml`: Configuration demonstrating different ways to use the chat messages format

## How it Works

The chat messages format allows you to specify messages with roles and content, while adding a required `raw` field to satisfy the schema validation:

```yaml
prompts:
  - raw: '[{"role":"system","content":"Basic content"}]'
    label: 'Mixed File Formats'
    messages:
      - role: system
        content: file://system.txt
      - role: user
        content: file://user.md
      - role: assistant
        content: file://assistant.json
```

This creates a chat prompt with messages in the exact order specified in the configuration. Each message's content can be:

1. A direct string
2. A file reference in any supported format (.txt, .j2, .md, .json, .js, etc.)

## Supported File Formats

- **Plain Text (.txt)**: Simple text content
- **Template Files (.j2)**: Jinja2/Nunjucks templates with variable substitution
- **Markdown (.md)**: Formatted text with markdown syntax
- **JSON (.json)**: Structured data that gets parsed
- **JavaScript (.js)**: Dynamic content generation through functions
- **Python (.py)**: Python functions for complex prompt generation
- **YAML (.yaml/.yml)**: Structured data in YAML format

## Variables

Variables are processed for each file using Nunjucks templating, regardless of the file format:

```
# In system.j2
You are a helpful assistant specialized in {{ domain }}.
```

## Usage

You can run this example with:

```bash
npx promptfoo@latest init --example chat-messages-format
```

Or manually:

```bash
cd examples/chat-messages-format
promptfoo eval
```

This will evaluate the prompts using the echo provider and the latest models to show the processed output.

## Benefits

- Keep system, user, and assistant prompts in separate files
- Use the most appropriate file format for each component
- Create multi-turn conversations with mixed formats
- Maintain precise control over message order
- Works with all file formats supported by promptfoo
