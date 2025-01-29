---
sidebar_label: Custom Go (Golang)
---

# Custom Go Provider

The Go (`golang`) provider allows you to use a Go script as an API provider for evaluating prompts. This is useful when you have custom logic or models implemented in Go that you want to integrate with your test suite.

:::info
The golang provider currently experimental
:::

## Configuration

To configure the Go provider, you need to specify the path to your Go script and any additional options you want to pass to the script. Here's an example configuration in YAML format:

```yaml
providers:
  - id: 'file://path/to/your/script.go'
    label: 'Go Provider' # Optional display label for this provider
    config:
      additionalOption: 123
```

## Go Script

Your Go script should implement a `CallApi` function that accepts a prompt, options, and context as arguments. It should return a `map[string]interface{}` containing at least an `output` field.

Here's an example of a Go script that could be used with the Go provider:

```go
package main

import (
    "context"
    "fmt"
    "os"

    "github.com/sashabaranov/go-openai"
)

var client *openai.Client

func init() {
    client = openai.NewClient(os.Getenv("OPENAI_API_KEY"))
}

func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
    resp, err := client.CreateChatCompletion(
        context.Background(),
        openai.ChatCompletionRequest{
            Model: openai.GPT4,
            Messages: []openai.ChatCompletionMessage{
                {
                    Role:    openai.ChatMessageRoleSystem,
                    Content: "You are a marketer working for a startup called Acme.",
                },
                {
                    Role:    openai.ChatMessageRoleUser,
                    Content: prompt,
                },
            },
        },
    )

    if err != nil {
        return nil, fmt.Errorf("ChatCompletion error: %v", err)
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
