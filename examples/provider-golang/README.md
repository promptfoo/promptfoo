# provider-golang (Golang Provider Example)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-golang
cd provider-golang
```

This example compares two Go providers that share an OpenAI client. See the
[Go provider docs](https://www.promptfoo.dev/docs/providers/go/) for the provider interface.

## Directory Structure

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

Both providers use named packages and support standard Go builds:

```sh
go build ./...
```

## Prerequisites

1. Go installed (1.23.6 or later)
2. OpenAI Go client library:

   ```sh
   go get github.com/sashabaranov/go-openai@v1.42.1
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
