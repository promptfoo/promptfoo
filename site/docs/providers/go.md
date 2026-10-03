---
sidebar_label: Custom Go (Golang)
description: Use Go functions as Promptfoo providers. Configure provider files, pass options, and return outputs from named packages or legacy package main implementations.
---

# Custom Go Provider

Use a Go function as a Promptfoo provider to evaluate your existing Go clients, models, or application logic.

## Quick Start

You can initialize a new Go provider project using:

```sh
promptfoo init --example provider-golang
```

## Provider Interface

Your Go code must implement the `CallApi` function with this signature:

```go
func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error)
```

The function should:

- Accept a prompt string and configuration options
- Return a map containing an "output" key with the response
- Return an error if the operation fails

Export the function as `CallApi`. Provider ids can omit the function suffix or use
`:CallApi` or `:call_api`; other names are rejected.

Place the provider inside a Go module with a `go.mod` in its directory or an ancestor.

## Configuration

Set the provider file path and pass custom values through `config`:

```yaml
providers:
  - id: 'file://path/to/your/script.go'
    label: 'Go Provider' # Optional display label for this provider
    config:
      additionalOption: 123
```

## Example Implementation

Here's a complete example using the OpenAI API:

```go
// Package provider implements a promptfoo provider that uses OpenAI's API.
package provider

import (
    "context"
    "fmt"
    "os"

    "github.com/sashabaranov/go-openai"
)

var client = openai.NewClient(os.Getenv("OPENAI_API_KEY"))

// CallApi processes prompts with configurable options.
func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
    temp := 0.7
    if config, ok := options["config"].(map[string]interface{}); ok {
        if val, ok := config["temperature"].(float64); ok {
            temp = val
        }
    }

    resp, err := client.CreateChatCompletion(
        context.Background(),
        openai.ChatCompletionRequest{
            Model: openai.GPT4o,
            Messages: []openai.ChatCompletionMessage{
                {
                    Role:    openai.ChatMessageRoleUser,
                    Content: prompt,
                },
            },
            Temperature: float32(temp),
        },
    )

    if err != nil {
        return nil, fmt.Errorf("chat completion error: %v", err)
    }

    return map[string]interface{}{
        "output": resp.Choices[0].Message.Content,
    }, nil
}
```

## Package layout

Use a named, importable package for providers in a regular Go module. Promptfoo builds a
separate entry point and imports the whole package, including helpers in sibling files.
The module remains buildable with `go build ./...`.

Legacy `package main` providers compile only the selected file alongside promptfoo's
entry point. Keep helpers in that file and omit `func main()`. This lets several providers
with their own `CallApi` share a directory, but those files cannot form a standalone Go command.

## Using the Provider

To use the Go provider in your promptfoo configuration:

```yaml
providers:
  - id: 'file://path/to/your/script.go'
    config:
      # Any additional configuration options
```

Or in the CLI:

```
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv -v vars.csv -r 'file://path/to/your/script.go'
```
