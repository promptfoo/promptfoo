---
title: Gollem (Go Agent Framework) Integration
sidebar_label: Gollem (Go Agent Framework)
description: Test and evaluate LLM agents built with gollem, a Go framework for LLM-powered agents with tool use, using promptfoo's built-in OpenAI-compatible provider.
sidebar_position: 50
---

# Gollem integration

[Gollem](https://github.com/fugue-labs/gollem) is a Go framework for building LLM-powered agents with tool use, streaming, and multi-provider support. Because gollem's OpenAI provider speaks the standard OpenAI API protocol, you can point promptfoo at a gollem-powered server and evaluate your agents using promptfoo's built-in `openai:chat` provider.

## How it works

Gollem can serve any agent configuration behind an OpenAI-compatible HTTP API. This means promptfoo can communicate with your gollem agent using the same protocol it uses for OpenAI, with no custom provider needed.

```text
promptfoo ──► OpenAI API protocol ──► gollem server ──► LLM provider(s)
                                           │
                                           ▼
                                      Tool execution,
                                      multi-step reasoning
```

## Setup

### 1. Create a gollem server

Write a Go server that exposes your gollem agent over the OpenAI-compatible API:

```go
package main

import (
    "log"
    "net/http"

    "github.com/fugue-labs/gollem/core"
    "github.com/fugue-labs/gollem/providers/openai"
    "github.com/fugue-labs/gollem/ext/server"
)

func main() {
    // Create an LLM provider.
    provider, err := openai.New()
    if err != nil {
        log.Fatal(err)
    }

    // Define tools your agent can use.
    tools := []core.Tool{
        {
            Name:        "lookup_user",
            Description: "Look up a user by email address",
            Parameters: map[string]any{
                "type": "object",
                "properties": map[string]any{
                    "email": map[string]any{
                        "type":        "string",
                        "description": "The user's email address",
                    },
                },
                "required": []string{"email"},
            },
        },
    }

    // Create and start the OpenAI-compatible server.
    srv := server.NewOpenAI(provider, server.WithTools(tools))
    log.Println("gollem server listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", srv))
}
```

Start the server:

```bash
export OPENAI_API_KEY="your-key"
go run server.go
```

### 2. Configure promptfoo

Create a `promptfooconfig.yaml` that points the `openai:chat` provider at your gollem server:

```yaml title="promptfooconfig.yaml"
description: 'Evaluate gollem agent'

providers:
  - id: openai:chat:gpt-4o
    config:
      apiBaseUrl: http://localhost:8080/v1

prompts:
  - 'You are a helpful assistant. {{message}}'

tests:
  - vars:
      message: 'Look up the user with email alice@example.com'
    assert:
      - type: contains
        value: 'alice'
      - type: llm-rubric
        value: 'The response should contain user information for alice@example.com'

  - vars:
      message: 'What can you help me with?'
    assert:
      - type: llm-rubric
        value: 'The response should describe available capabilities including user lookup'

  - vars:
      message: 'Look up bob@example.com and tell me their account status'
    assert:
      - type: contains
        value: 'bob'
      - type: cost
        threshold: 0.05
```

### 3. Run the eval

```bash
npx promptfoo@latest eval
```

View results:

```bash
npx promptfoo@latest view
```

## Testing tool use

One of gollem's strengths is orchestrating tool calls. You can use promptfoo to verify that your agent correctly selects and uses tools:

```yaml title="promptfooconfig.yaml"
description: 'Test gollem agent tool usage'

providers:
  - id: openai:chat:gpt-4o
    config:
      apiBaseUrl: http://localhost:8080/v1

prompts:
  - |
    You are a customer support agent. Use the available tools to help the user.

    User: {{query}}

tests:
  - vars:
      query: 'What is the status of order #12345?'
    assert:
      - type: contains-any
        value:
          - 'order'
          - '12345'
      - type: llm-rubric
        value: 'The response should include specific order status information'

  - vars:
      query: 'Cancel my subscription'
    assert:
      - type: llm-rubric
        value: 'The response should confirm the cancellation or ask for verification'

  - vars:
      query: 'Transfer me to a human agent'
    assert:
      - type: llm-rubric
        value: 'The response should acknowledge the request for human assistance'
```

## Comparing providers

Since gollem supports multiple LLM providers, you can test the same agent with different backends:

```yaml title="promptfooconfig.yaml"
providers:
  # gollem with OpenAI backend
  - id: openai:chat:gpt-4o
    label: gollem-openai
    config:
      apiBaseUrl: http://localhost:8080/v1

  # gollem with Anthropic backend (on a different port)
  - id: openai:chat:claude-sonnet-4-5-20250929
    label: gollem-anthropic
    config:
      apiBaseUrl: http://localhost:8081/v1

  # Direct OpenAI for comparison
  - id: openai:chat:gpt-4o
    label: direct-openai

prompts:
  - 'You are a helpful assistant. {{message}}'

tests:
  - vars:
      message: 'Explain the difference between TCP and UDP'
    assert:
      - type: llm-rubric
        value: 'The response should accurately explain TCP and UDP differences'
```

## Environment variables

| Variable               | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `OPENAI_API_KEY`       | API key for the gollem server's LLM provider                 |
| `PROMPTFOO_CACHE_PATH` | Path to cache API responses (reduces costs during iteration) |

## Tips

- **Start simple:** Test basic prompt/response quality before testing complex tool chains.
- **Use caching:** Set `PROMPTFOO_CACHE_PATH` to avoid redundant API calls while iterating on assertions.
- **Test edge cases:** Include test cases for malformed input, missing data, and error conditions to verify your agent handles them gracefully.
- **Monitor costs:** Use the `cost` assertion type to ensure your agent stays within budget per interaction.
