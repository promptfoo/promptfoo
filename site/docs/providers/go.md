---
sidebar_label: Custom Go (Golang)
description: Configure custom Go providers to integrate your own Go-based LLM clients, models, and APIs with promptfoo's testing framework for seamless evaluation
---

# Custom Go Provider

The Go (`golang`) provider allows you to use Go code as an API provider for evaluating prompts. This is useful when you have custom logic, API clients, or models implemented in Go that you want to integrate with your test suite.

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

To configure the Go provider, you need to specify the path to your Go script and any additional options you want to pass to the script. Here's an example configuration in YAML format:

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

// client is the shared OpenAI client instance.
var client = openai.NewClient(os.Getenv("OPENAI_API_KEY"))

// CallApi processes prompts with configurable options.
func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
    temp := 0.7
    if config, ok := options["config"].(map[string]interface{}); ok {
        if val, ok := config["temperature"].(float64); ok {
            temp = val
        }
    }

    // Call the API
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
