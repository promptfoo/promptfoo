---
sidebar_position: 2
---

# Anthropic

This provider supports the [Anthropic Claude](https://www.anthropic.com/claude) series of models.

> **Note:** Anthropic models can also be accessed through Amazon Bedrock. For information on using Anthropic models via Bedrock, please refer to our [AWS Bedrock documentation](/docs/providers/aws-bedrock).

## Examples

We provide several example implementations demonstrating different Claude capabilities:

- [Tool Use Example](https://github.com/promptfoo/promptfoo/tree/main/examples/tool-use) - Shows how to use Claude's tool calling capabilities
- [Vision Example](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vision) - Demonstrates using Claude for image analysis
- [Model Comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vs-gpt) - Compares Claude with GPT-4 on various tasks
- [Image Analysis Comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vs-gpt-image) - Compares image analysis capabilities between Claude and GPT

## Setup

To use Anthropic, you need to set the `ANTHROPIC_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Create Anthropic API keys [here](https://console.anthropic.com/settings/keys).

Example of setting the environment variable:

```sh
export ANTHROPIC_API_KEY=your_api_key_here
```

### Supported Parameters

| Config Property | Environment Variable  | Description                                                       |
| --------------- | --------------------- | ----------------------------------------------------------------- |
| apiKey          | ANTHROPIC_API_KEY     | Your API key from Anthropic                                       |
| apiBaseUrl      | ANTHROPIC_BASE_URL    | The base URL for requests to the Anthropic API                    |
| temperature     | ANTHROPIC_TEMPERATURE | Controls the randomness of the output (default: 0)                |
| max_tokens      | ANTHROPIC_MAX_TOKENS  | The maximum length of the generated text (default: 1024)          |
| top_p           | -                     | Controls nucleus sampling, affecting the randomness of the output |
| top_k           | -                     | Only sample from the top K options for each subsequent token      |
| tools           | -                     | An array of tool or function definitions for the model to call    |
| tool_choice     | -                     | An object specifying the tool to call                             |
| headers         | -                     | Additional headers to be sent with the API request                |

## Latest API (Messages)

> The messages API supports all the latest Anthropic models.

The `anthropic` provider supports the following models via the messages API:

- `anthropic:messages:claude-3-5-sonnet-20241022`
- `anthropic:messages:claude-3-5-sonnet-20240620`
- `anthropic:messages:claude-3-5-haiku-20241022`
- `anthropic:messages:claude-3-opus-20240229`
- `anthropic:messages:claude-3-sonnet-20240229`
- `anthropic:messages:claude-3-haiku-20240307`
- `anthropic:messages:claude-2.0`
- `anthropic:messages:claude-2.1`
- `anthropic:messages:claude-instant-1.2`

### Prompt Template

To allow for compatibility with the OpenAI prompt template, the following format is supported:

Example: `prompt.json`

```json
[
  {
    "role": "system",
    "content": "{{ system_message }}"
  },
  {
    "role": "user",
    "content": "{{ question }}"
  }
]
```

If the role `system` is specified, it will be automatically added to the API request.
All `user` or `assistant` roles will be automatically converted into the right format for the API request.
Currently, only type `text` is supported.

The `system_message` and `question` are example variables that can be set with the `var` directive.

### Options

The Anthropic provider supports several options to customize the behavior of the model. These include:

- `temperature`: Controls the randomness of the output.
- `max_tokens`: The maximum length of the generated text.
- `top_p`: Controls nucleus sampling, affecting the randomness of the output.
- `top_k`: Only sample from the top K options for each subsequent token.
- `tools`: An array of tool or function definitions for the model to call.
- `tool_choice`: An object specifying the tool to call.

Example configuration with options and prompts:

```yaml
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
    config:
      temperature: 0.0
      max_tokens: 512
prompts:
  - file://prompt.json
```

### Tool Use

The Anthropic provider supports tool use (or function calling). Here's an example configuration for defining tools:

```yaml
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
    config:
      tools:
        - name: get_weather
          description: Get the current weather in a given location
          input_schema:
            type: object
            properties:
              location:
                type: string
                description: The city and state, e.g., San Francisco, CA
              unit:
                type: string
                enum:
                  - celsius
                  - fahrenheit
            required:
              - location
```

See the [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/tool-use) for more information on how to define tools and the tool use example [here](https://github.com/promptfoo/promptfoo/tree/main/examples/tool-use).

### Images / Vision

You can include images in the prompts in Claude 3 models.

See the [Claude vision example](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vision).

One important note: The Claude API only supports base64 representations of images.
This is different from how OpenAI's vision works, as it supports grabbing images from a URL. As a result, if you are trying to compare Claude 3 and OpenAI vision capabilities, you will need to have separate prompts for each.

See the [OpenAI vision example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-vision) to understand the differences.

### Prompt Caching

> Available since Claude 3.5 (January 2024)

Claude supports prompt caching to optimize API usage and reduce costs for repetitive tasks. This feature caches portions of your prompts to avoid reprocessing identical content in subsequent requests.

**Supported Models:**

- Claude 3.5 Sonnet
- Claude 3.5 Haiku
- Claude 3 Haiku
- Claude 3 Opus

**Requirements:**

- Minimum cacheable prompt length:
  - Sonnet/Opus: 1024 tokens
  - Haiku: 2048 tokens
- Cache lifetime: 5 minutes
- Cache type: `ephemeral` (only supported type)

**Pricing:**
| Operation | Cost (relative to base input tokens) |
| -------------- | ------------------------------------ |
| Cache write | +25% |
| Cache read | -90% |
| Regular tokens | Standard rates |

#### Basic Example

```yaml
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
prompts:
  - messages:
      - role: system
        content:
          - type: text
            text: 'You are an AI assistant tasked with analyzing literary works.'
            # System messages are good candidates for caching
            cache_control:
              type: ephemeral
          - type: text
            text: '{{context}}' # Large document content
            cache_control:
              type: ephemeral
      - role: user
        content: '{{question}}' # Dynamic content, not cached
```

#### What Can Be Cached

| Content Type     | Description                  | Best Practice                  |
| ---------------- | ---------------------------- | ------------------------------ |
| Tool definitions | Function/tool specifications | Cache if tools remain constant |
| System messages  | Instructions and context     | Ideal for caching              |
| Message content  | User/assistant messages      | Cache stable content           |
| Images           | Visual content               | Cache if reused frequently     |
| Tool use results | Output from tool calls       | Cache if deterministic         |

#### Best Practices

1. **Content Organization:**

   - Place cached content at the beginning of prompts
   - Group similar content under the same cache block
   - Keep dynamic content separate from cached content

2. **Performance:**

   - Use cache breakpoints strategically
   - Ensure cached sections remain identical across calls
   - Verify minimum token requirements are met
   - Wait for first response before parallel requests

3. **Monitoring:**
   Track cache performance using response fields:
   ```json
   {
     "usage": {
       "cache_creation_input_tokens": 1000,  # Tokens written to cache
       "cache_read_input_tokens": 1000,      # Tokens read from cache
       "input_tokens": 500                   # Non-cached tokens
     }
   }
   ```

See [Anthropic's Prompt Caching Guide](https://docs.anthropic.com/claude/docs/prompt-caching) for more details.

### Citations

> Available since Claude 3.5 (January 2024)

Claude can provide detailed citations when answering questions about documents, helping track and verify information sources. This feature works with text documents, PDFs, and custom content structures.

**Supported Models:**

- Claude 3.5 Sonnet
- Claude 3.5 Haiku

#### Document Types Overview

| Type           | Best For                            | Chunking              | Citation Format               |
| -------------- | ----------------------------------- | --------------------- | ----------------------------- |
| Plain text     | Simple documents, prose             | Automatic (sentences) | Character indices (0-indexed) |
| PDF            | Complex documents with visuals      | Automatic (sentences) | Page numbers (1-indexed)      |
| Custom content | Lists, transcripts, structured data | None (user-defined)   | Block indices (0-indexed)     |

#### Plain Text Documents

Plain text documents are automatically chunked into sentences for precise citations.

```yaml
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
prompts:
  - messages:
      - role: user
        content:
          - type: document
            source:
              type: text
              media_type: text/plain
              data: 'The grass is green. The sky is blue. The sun is bright.'
            title: Nature Description # Optional: helps identify the source
            context: Basic description of nature elements # Optional: additional metadata
            citations:
              enabled: true
          - type: text
            text: What colors are mentioned in the text?
```

#### PDF Documents

PDF documents are processed as both text and images, enabling analysis of charts, diagrams, and tables.

**Requirements:**

- Maximum request size: 32MB
- Maximum pages: 100
- Format: Standard PDF (no passwords/encryption)
- Supported models: Claude 3.5 Sonnet models only

**Token Usage:**

- Text: ~1,500-3,000 tokens per page (content dependent)
- Images: Each page counts as one image

For PDFs, store the prompt in a separate file for better maintainability:

`prompts/pdf-example.json`:

```json
[
  {
    "role": "user",
    "content": [
      {
        "type": "document",
        "source": {
          "type": "base64",
          "media_type": "application/pdf",
          "data": "file://path/to/document.pdf"
        },
        "title": "Research Paper",
        "context": "Academic paper about climate change",
        "citations": {
          "enabled": true
        },
        "cache_control": {
          "type": "ephemeral" // Optional: Enable caching for repeated analysis
        }
      },
      {
        "type": "text",
        "text": "What are the key findings of this paper?"
      }
    ]
  }
]
```

Use it in your config:

```yaml
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
prompts:
  - file: prompts/pdf-example.json
```

**PDF Best Practices:**

1. **Document Preparation:**

   - Use standard fonts
   - Ensure text is clear and legible
   - Rotate pages to proper orientation
   - Use logical page numbers

2. **Request Structure:**

   - Place PDFs before text content
   - Split large PDFs into chunks
   - Enable caching for repeated analysis
   - Consider file size limits

3. **Performance:**
   - Combine with prompt caching for better efficiency
   - Monitor token usage for large documents
   - Use appropriate chunk sizes

#### Custom Content Documents

Custom content documents give you control over citation granularity. Useful for structured data or when you need specific chunking behavior.

```yaml
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
prompts:
  - messages:
      - role: user
        content:
          - type: document
            source:
              type: content
              content:
                - type: text
                  text: "Chapter 1: The Beginning\nIt was a dark and stormy night."
                - type: text
                  text: "Chapter 2: The Middle\nThe sun finally broke through the clouds."
                - type: text
                  text: "Chapter 3: The End\nAnd they all lived happily ever after."
            title: Story Chapters
            context: A simple story broken into chapters
            citations:
              enabled: true
          - type: text
            text: What happens with the weather in this story?
```

#### Response Format

When citations are enabled, responses include detailed metadata:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Based on the story, "
    },
    {
      "type": "text",
      "text": "it starts with a dark and stormy night",
      "citations": [
        {
          "type": "block_location",
          "cited_text": "Chapter 1: The Beginning\nIt was a dark and stormy night.",
          "document_index": 0,
          "block_index": 0
        }
      ]
    }
  ]
}
```

**Benefits:**

- Cost efficiency: Cited text doesn't count towards output tokens
- Reliability: Guaranteed valid pointers to source documents
- Quality: Better citation relevance compared to prompt-based approaches

**Limitations:**

- Image citations not yet supported
- All documents in a request must have citations enabled or disabled
- Citations must reference provided documents

See [Anthropic's Citations Guide](https://docs.anthropic.com/claude/docs/citations) for more details.

### Additional Capabilities

The Anthropic provider includes several built-in features to help monitor and optimize your API usage:

#### Request Caching

Automatically caches LLM requests to improve performance and reduce costs:

```yaml
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
    config:
      cache: false # Optional: disable request caching (enabled by default)
```

#### Token Usage Tracking

Monitor token usage in API responses:

```json
{
  "usage": {
    "input_tokens": 150,      # Tokens in the request
    "output_tokens": 50,      # Tokens in the response
    "total_tokens": 200       # Total tokens used
  }
}
```

#### Cost Calculation

Automatically calculates costs based on current [Anthropic pricing](https://docs.anthropic.com/claude/docs/models-overview):

| Model             | Input Tokens | Output Tokens |
| ----------------- | ------------ | ------------- |
| Claude 3 Opus     | $15/M        | $75/M         |
| Claude 3.5 Sonnet | $3/M         | $15/M         |
| Claude 3.5 Haiku  | $0.80/M      | $4/M          |

## Deprecated API (Completions)

> **Warning**: The completions API is deprecated and will be removed in a future release. Please migrate to the Messages API described above. See the [migration guide](https://docs.anthropic.com/claude/reference/migrating-from-text-completions-to-messages) for details.

### Supported Models

| Model ID                                     | Description                      | Status     |
| -------------------------------------------- | -------------------------------- | ---------- |
| `anthropic:completion:claude-1`              | Original Claude model            | Deprecated |
| `anthropic:completion:claude-1-100k`         | Claude with 100k context         | Deprecated |
| `anthropic:completion:claude-instant-1`      | Faster, cheaper Claude variant   | Deprecated |
| `anthropic:completion:claude-instant-1-100k` | Instant Claude with 100k context | Deprecated |

### Configuration

Required environment variables:

```sh
export ANTHROPIC_API_KEY=your_api_key_here  # Required
export ANTHROPIC_STOP='["stop1", "stop2"]'  # Optional: JSON string of stop sequences
export ANTHROPIC_MAX_TOKENS=1024            # Optional: defaults to 1024
export ANTHROPIC_TEMPERATURE=0              # Optional: defaults to 0
```

Or specify in your config:

```yaml
providers:
  - id: anthropic:completion:claude-1
    config:
      temperature: 0
      max_tokens: 1024
      stop: ['stop1', 'stop2']
prompts:
  - file: prompts/completion-prompt.txt # Plain text prompt file
```

### Migration Guide

To migrate from completions to messages:

1. Update your provider ID:

```yaml
# Before
providers:
  - id: anthropic:completion:claude-1

# After
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
```

2. Convert text prompts to message format:

```yaml
# Before
prompts:
  - file: prompt.txt

# After
prompts:
  - messages:
      - role: user
        content:
          - type: text
            text: "{{prompt}}"  # Content of your original prompt.txt
```

3. Update environment variables:

- Keep: `ANTHROPIC_API_KEY`
- Remove: `ANTHROPIC_STOP`, `ANTHROPIC_MAX_TOKENS`, `ANTHROPIC_TEMPERATURE`
- Add these to the provider config instead

See the [Anthropic migration guide](https://docs.anthropic.com/claude/reference/migrating-from-text-completions-to-messages) for more details.

## Model-Graded Tests

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` will automatically use Anthropic as the grading provider if:

1. `ANTHROPIC_API_KEY` is set
2. `OPENAI_API_KEY` is not set

If both API keys are present, OpenAI will be used by default. You can explicitly override the grading provider in your configuration.

Because of how model-graded evals are implemented, **the model must support chat-formatted prompts** (except for embedding or classification models).

You can override the grading provider in several ways:

1. For all test cases using `defaultTest`:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider:
      id: anthropic:messages:claude-3-5-sonnet-20241022
      config:
        # optional provider config options
```

2. For individual assertions:

```yaml
assert:
  - type: llm-rubric
    value: Do not mention that you are an AI or chat assistant
    provider:
      id: anthropic:messages:claude-3-5-sonnet-20241022
```

3. For specific tests:

```yaml
tests:
  - vars:
      question: What is the capital of France?
    options:
      provider:
        id: anthropic:messages:claude-3-5-sonnet-20241022
    assert:
      - type: llm-rubric
        value: Answer should mention Paris
```
