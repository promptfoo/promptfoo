# provider-golang (Golang Provider Example)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-golang
cd provider-golang
```

This example demonstrates how to structure a Go-based provider for promptfoo. For detailed documentation, see [Go Provider](https://www.promptfoo.dev/docs/providers/go/) documentation.

To get started with this example:

```sh
promptfoo init --example provider-golang
```

## Directory Structure

This example shows two implementations of the same provider interface:

```text
provider-golang/
├── go.mod               # Root module definition
├── provider.go          # Root provider implementation (package provider)
├── core/                # Supporting code
│   └── openai.go        # OpenAI client wrapper
├── pkg1/                # Shared utilities
│   └── utils.go         # Configuration
├── evaluation/          # Alternative implementation
│   └── provider.go      # Provider with same interface (package evaluation)
└── promptfooconfig.yaml # Config comparing both implementations
```

The structure demonstrates how to:

1. Keep shared Go code in a single module
2. Implement the same provider interface in different ways
3. Compare multiple implementations in one config

Both providers use named, importable packages rather than `package main`, so the module stays a
normal Go module:

```sh
go build ./...
```

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
  - id: 'file://evaluation/provider.go:CallApi'
    label: 'Provider in evaluation/'

  - id: 'file://provider.go:CallApi'
    label: 'Provider in root'
    config:
      reasoning_effort: 'high'
```

## Provider Implementations

Both `provider.go` and `evaluation/provider.go` implement the same interface:

```go
func CallApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error)
```

They share the same OpenAI client code but can be configured differently through the config file.
