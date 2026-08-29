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

The exported function must be named `CallApi`. Promptfoo's generated entry point resolves that
symbol and no other, so a provider id such as `file://provider.go:MyProvider` will not work.

Your provider must live inside a Go module: promptfoo walks up from the script looking for a
`go.mod` and fails if it does not find one.

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
    // Extract configuration. Check the "config" key separately: a single-value type
    // assertion panics when the provider is used without a config block.
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

Prefer a named, importable package as shown above. Promptfoo detects the package with `go list`,
generates its entry point in a separate directory, and imports your provider through the module
path from `go.mod`. Because your source is never compiled next to a generated `main` package,
repository-wide commands such as `go build ./...` keep working.

Named packages are also compiled as a whole package, so the provider can call helpers defined in
sibling files in the same directory.

`package main` providers remain supported for backward compatibility, with two caveats:

- Only the provider file itself is compiled, so helpers in sibling files are not visible and fail
  with `undefined: <helper>`. Move them into the same file, or switch to a named package.
- The provider cannot declare its own `func main()`; it would collide with the generated entry
  point. This is why a `package main` provider breaks `go build ./...` — the package has no `main`
  function of its own.

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
