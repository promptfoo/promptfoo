---
title: Gollem (Go Agent Framework) Integration
sidebar_label: Gollem (Go Agent Framework)
description: Test Gollem agents with promptfoo by calling Gollem's HTTP handler, extracting responses, and comparing tool-enabled agent behavior across model backends.
sidebar_position: 50
---

# Gollem integration

[Gollem](https://github.com/fugue-labs/gollem) is a Go framework for building LLM-powered agents with tool use, streaming, and multi-provider support. Gollem's HTTP adapters expose an agent endpoint that accepts a `prompt` field and returns a `response` field, which you can evaluate using promptfoo's [HTTP provider](/docs/providers/http/).

## How it works

Gollem's `contrib/chi` adapter exposes its own small JSON contract. It is separate from Gollem's outbound OpenAI model provider: the handler does not accept an OpenAI Chat Completions `messages` body or return `choices`. Configure promptfoo to post the rendered prompt and extract the handler's response:

```text
promptfoo HTTP provider ──► gollem handler ──► LLM provider(s)
                                           │
                                           ▼
                                      Tool execution,
                                      multi-step reasoning
```

## Setup

### 1. Create a gollem server

Initialize a Go module. Gollem's current module declares Go 1.25.1 or newer:

```bash
mkdir gollem-eval-server
cd gollem-eval-server
go mod init gollem-eval-server
go get github.com/fugue-labs/gollem@latest
```

Write `server.go` to expose a Gollem agent using its `contrib/chi` HTTP adapter:

```go title="server.go"
package main

import (
    "context"
    "fmt"
    "log"
    "net/http"

    chihandler "github.com/fugue-labs/gollem/contrib/chi"
    "github.com/fugue-labs/gollem/core"
    "github.com/fugue-labs/gollem/provider/openai"
)

// LookupParams defines the tool's input schema.
type LookupParams struct {
    Email string `json:"email" jsonschema:"description=The user's email address"`
}

func main() {
    model := openai.New()

    lookupTool := core.FuncTool[LookupParams](
        "lookup_user",
        "Look up a user by email address",
        func(ctx context.Context, p LookupParams) (string, error) {
            // In production, query your database here.
            return fmt.Sprintf("User %s: active, joined 2024-01-15", p.Email), nil
        },
    )

    agent := core.NewAgent[string](model,
        core.WithTools[string](lookupTool),
        core.WithSystemPrompt[string]("You are a helpful assistant. Use the lookup_user tool to find user information."),
    )

    mux := http.NewServeMux()
    mux.HandleFunc("POST /agent",
        chihandler.Handler(&chihandler.AgentWrapper{Agent: agent}))

    log.Println("gollem server listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

Start the server:

```bash
go mod tidy
export OPENAI_API_KEY="your-key"
go run server.go
```

### 2. Configure promptfoo

Create a `promptfooconfig.yaml` that sends the prompt in the format accepted by Gollem's handler and extracts its `response` value:

```yaml title="promptfooconfig.yaml"
description: 'Evaluate gollem agent'

providers:
  - id: http
    config:
      url: http://localhost:8080/agent
      method: POST
      body:
        prompt: '{{prompt}}'
      transformResponse: json.response

prompts:
  - 'You are a helpful assistant. {{message}}'

tests:
  - vars:
      message: 'Look up the user with email alice@example.com'
    assert:
      - type: contains
        value: 'alice'
      - type: contains
        value: 'active'

  - vars:
      message: 'Look up bob@example.com and tell me their account status'
    assert:
      - type: contains
        value: 'bob'
      - type: contains
        value: 'active'
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

Use test cases that can only pass when the sample agent invokes `lookup_user` and returns its output:

```yaml title="promptfooconfig.yaml"
description: 'Test Gollem lookup tool usage'

providers:
  - id: http
    config:
      url: http://localhost:8080/agent
      method: POST
      body:
        prompt: '{{prompt}}'
      transformResponse: json.response

prompts:
  - |
    Use the lookup_user tool and return the account status for {{email}}.

tests:
  - vars:
      email: 'carol@example.com'
    assert:
      - type: contains
        value: 'carol@example.com'
      - type: contains
        value: 'active'

  - vars:
      email: 'dave@example.com'
    assert:
      - type: contains
        value: 'dave@example.com'
```

## Comparing providers

Since gollem supports multiple LLM providers, you can test the same agent with different backends:

```yaml title="promptfooconfig.yaml"
providers:
  # Gollem agent configured with an OpenAI backend
  - id: http
    label: gollem-openai
    config:
      url: http://localhost:8080/agent
      method: POST
      body:
        prompt: '{{prompt}}'
      transformResponse: json.response

  # Gollem agent configured with an Anthropic backend (on a different port)
  - id: http
    label: gollem-anthropic
    config:
      url: http://localhost:8081/agent
      method: POST
      body:
        prompt: '{{prompt}}'
      transformResponse: json.response

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
- **Monitor costs:** Return cost metadata from your handler before using `cost` assertions with a custom HTTP provider.
