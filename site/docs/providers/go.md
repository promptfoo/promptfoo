---
sidebar_label: Custom Go (Golang)
---

# Custom Go Provider

The Go (`golang`) provider allows you to use a Go script as an API provider for evaluating prompts. This is useful when you have custom logic or models implemented in Go that you want to integrate with your test suite.

:::info
The golang provider is currently experimental
:::

## Configuration

To configure the Go provider, you need to specify the path to your Go script and any additional options you want to pass to the script. Here's an example configuration in YAML format:

```yaml
providers:
  - id: 'file://provider.go'
    label: 'Go Provider' # Optional display label for this provider
    config:
      goExecutable: go # Optional, defaults to 'go'
```

## Project Structure

The Go provider supports both simple single-file scripts and more complex project structures including internal packages. Here's an example of a recommended project structure:

```
your-project/
├── go.mod
├── go.sum
├── provider.go           # Main provider implementation
├── promptfooconfig.yaml  # promptfoo configuration
└── internal/            # Internal packages (if needed)
    └── client/
        └── client.go    # Implementation details
```

## Go Script

Your Go script should implement a `CallApi` function that accepts a prompt, options, and context as arguments. It should return a `map[string]interface{}` containing at least an `output` field.

Here's an example of a Go script that uses internal packages:

```go
// provider.go
package main

import (
    "your-module/internal/client"
)

var apiClient *client.Client

func init() {
    apiClient = client.NewClient()
}

func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
    output, err := apiClient.GenerateResponse(prompt)
    if err != nil {
        return nil, err
    }

    return map[string]interface{}{
        "output": output,
    }, nil
}
```

```go
// internal/client/client.go
package client

import (
    "context"
    "fmt"
    "os"

    "github.com/sashabaranov/go-openai"
)

type Client struct {
    client *openai.Client
}

func NewClient() *Client {
    return &Client{
        client: openai.NewClient(os.Getenv("OPENAI_API_KEY")),
    }
}

func (c *Client) GenerateResponse(prompt string) (string, error) {
    resp, err := c.client.CreateChatCompletion(
        context.Background(),
        openai.ChatCompletionRequest{
            Model: openai.GPT4,
            Messages: []openai.ChatCompletionMessage{
                {
                    Role:    openai.ChatMessageRoleSystem,
                    Content: "You are a helpful assistant.",
                },
                {
                    Role:    openai.ChatMessageRoleUser,
                    Content: prompt,
                },
            },
        },
    )

    if err != nil {
        return "", fmt.Errorf("API error: %v", err)
    }

    return resp.Choices[0].Message.Content, nil
}
```

## Using the Provider

To use the Go provider in your promptfoo configuration:

```yaml
description: Example using Go provider
providers:
  - id: 'file://provider.go'
    config:
      goExecutable: go # Optional

prompts:
  - Write a tweet about our product
  - Write a blog post about AI

tests:
  - description: Test tweet generation
    vars:
      prompt: Write a tweet about our product
    assert:
      - type: contains
        value: product
      - type: javascript
        value: response.output.length < 280
```

Or in the CLI:

```bash
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv -v vars.csv -r 'file://provider.go'
```

## Notes

- The Go provider supports internal packages and complex project structures
- Make sure your `go.mod` file correctly defines your module path
- Environment variables (like API keys) are passed through to your Go code
- The provider creates a temporary build environment that preserves your project structure
