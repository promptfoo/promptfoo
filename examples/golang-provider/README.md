# Golang Provider Example

This example demonstrates how to structure a Go-based provider for promptfoo. For detailed documentation, see [Go Provider](https://www.promptfoo.dev/docs/providers/go/) documentation.

To get started with this example:

```sh
promptfoo init --example golang-provider
```

## Directory Structure

This example shows two implementations of the same provider interface:

```
golang-provider/
├── go.mod            # Root module definition
├── main.go           # Root provider implementation
├── core/             # Supporting code
│   └── openai.go     # OpenAI client wrapper
├── pkg1/             # Shared utilities
│   └── utils.go      # Configuration
├── evaluation/       # Alternative implementation
│   └── main.go      # Provider with same interface
└── promptfooconfig.yml  # Config comparing both implementations
```

The structure demonstrates how to:

1. Keep shared Go code in a single module
2. Implement the same provider interface in different ways
3. Compare multiple implementations in one config

## Prerequisites

1. Go installed (1.16 or later)
2. OpenAI Go client library:

   ```sh
   go get github.com/sashabaranov/go-openai@v1.37.0
   ```

3. Set your API key:

   ```sh
   export OPENAI_API_KEY=your_key_here
   ```

## Usage

Run the comparison:

```sh
npx promptfoo eval
```

Then view the results with:

```sh
npx promptfoo view
```

## Configuration

The config compares both implementations:

```yaml
providers:
  - id: 'file://evaluation/main.go:CallApi'
    label: 'Provider in evaluation/'

  - id: 'file://main.go:CallApi'
    label: 'Provider in root'
    config:
      reasoning_effort: 'high'
```

## Provider Implementations

Both `main.go` and `evaluation/main.go` implement the same interface:

```go
func CallApi(prompt string, options map[string]interface{}) (string, error)
```

They share the same OpenAI client code but can be configured differently through the config file.
