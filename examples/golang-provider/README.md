# Golang Provider Examples

This example demonstrates how to structure a Go-based provider for promptfoo. For detailed documentation, see [Go Provider](https://www.promptfoo.dev/docs/providers/go/) documentation.

To get started with this example:

```sh
promptfoo init --example golang-provider
```

## Directory Structures

This example shows two ways to organize your Go provider:

### Simple Structure

Everything in the root directory:

```
golang-provider/
├── go.mod
├── provider.go        # Provider implementation
└── promptfooconfig.yml
```

### Nested Structure

Provider in a subdirectory, with `go.mod` at the root:

```
golang-provider/
├── go.mod            # Root module definition
├── core/             # Supporting code
│   └── openai.go
├── evaluation/       # Provider directory
│   ├── main.go      # Provider implementation
│   └── promptfooconfig.yml  # Local config
└── promptfooconfig.yml      # Root config
```

The nested structure shows how to:

1. Place your provider in any subdirectory
2. Keep the `go.mod` file at the root
3. Run evaluations from different directories

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

From root directory:

```sh
npx promptfoo eval
```

From provider directory:

```sh
cd evaluation
npx promptfoo eval
```

## Configuration

Root config:

```yaml
providers:
  - id: file://evaluation/main.go:CallApi
```

Provider directory config:

```yaml
providers:
  - id: file://main.go:CallApi
```

## Troubleshooting

1. Ensure `OPENAI_API_KEY` is set
2. Provider paths:
   - From root: use `file://evaluation/main.go`
   - From provider dir: use `file://main.go`
