# Golang Provider Examples

This directory demonstrates how to use Go with promptfoo, showing:

1. How to implement a basic provider
2. How to run promptfoo from different directories using the same provider

## Directory Structure

```
golang-provider/
├── go.mod                  # Module definition
├── provider.go             # Provider implementation
├── promptfooconfig.yaml    # Root config example
└── nested-config/          # Example of referencing provider from subdirectory
    └── promptfooconfig.yaml
```

## Prerequisites

1. Go installed (1.16 or later recommended)
2. OpenAI Go client library:
   ```sh
   go get github.com/sashabaranov/go-openai
   ```
3. Set your API key:
   ```sh
   export OPENAI_API_KEY=your_key_here
   ```

## Usage Examples

### 1. Basic Provider

Run the main example from the root directory:

```sh
npx promptfoo eval
```

### 2. Nested Config

Demonstrates how to reference a provider from a subdirectory:

```sh
cd nested-config
npx promptfoo eval
```

This shows how to:

- Reference a provider in a parent directory
- Run promptfoo from different locations
- Use the same provider with different configurations

## Provider Implementation

The provider (`provider.go`) shows:

- Basic OpenAI chat completion
- Temperature configuration
- Simple error handling

## Configuration

Each directory has its own `promptfooconfig.yaml` showing different ways to use the provider:

1. Root config (basic example):

```yaml
providers:
  - id: golang:provider.go:CallApi
    config:
      temperature: 0.7
```

2. Nested config (referencing parent provider):

```yaml
providers:
  - id: file://../provider.go:CallApi
    config:
      temperature: 0.2
```

## Development Notes

1. No manual compilation needed
2. Works on all platforms (Windows, Linux, macOS)
3. Each config can have its own test cases and settings

## Troubleshooting

1. Ensure `OPENAI_API_KEY` is set correctly
2. For nested configs, check that the provider path is correct relative to the config file
3. Run `go mod tidy` if you get module errors
