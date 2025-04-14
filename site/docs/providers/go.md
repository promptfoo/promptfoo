---
sidebar_label: Custom Go (Golang)
---

# Custom Go Provider

The Go (`golang`) provider allows you to use Go code as an API provider for evaluating prompts. This is useful when you have custom logic, API clients, or models implemented in Go that you want to integrate with your test suite.

:::info
The golang provider currently experimental
:::

## Quick Start

You can initialize a new Go provider project using:

```sh
promptfoo init --example golang-provider
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
// Package main implements a promptfoo provider that uses OpenAI's API.
package main

import (
    "fmt"
    "os"
    "github.com/sashabaranov/go-openai"
)

// client is the shared OpenAI client instance.
var client = openai.NewClient(os.Getenv("OPENAI_API_KEY"))

// CallApi processes prompts with configurable options.
func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
    // Extract configuration
    temp := 0.7
    if val, ok := options["config"].(map[string]interface{})["temperature"].(float64); ok {
        temp = val
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
