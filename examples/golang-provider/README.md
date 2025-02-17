# Golang Provider Examples

This directory demonstrates how to use Go with promptfoo, showing common patterns for implementing custom providers.

## Directory Structure

```
golang-provider/
├── go.mod                  # Module definition
├── provider.go             # Main provider example
├── promptfooconfig.yaml    # Main config
└── subprovider/           # Nested provider example
    ├── provider.go        # Alternative implementation
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

The main `provider.go` shows a simple OpenAI implementation:

```sh
npx promptfoo eval
```

### 2. Nested Provider

The `subprovider` demonstrates how to use a provider in a subdirectory:

```sh
cd subprovider
npx promptfoo eval
```

## Provider Implementations

1. **Main Provider** (`provider.go`):

   - Basic OpenAI chat completion
   - Configurable system prompts
   - Example of a simple provider

2. **Nested Provider** (`subprovider/provider.go`):
   - Different system prompt
   - Shows how to use providers in subdirectories
   - Demonstrates module path resolution

## Configuration

Each provider has its own `promptfooconfig.yaml` showing different configurations:

1. Root config (marketing focus):

```yaml
providers:
  - id: golang:provider.go
    config:
      systemPrompt: 'You are a marketer...'
```

2. Subprovider config (different focus):

```yaml
providers:
  - id: golang:provider.go
    config:
      systemPrompt: 'You are a technical writer...'
```

## Development Notes

1. No manual compilation needed
2. Works on all platforms (Windows, Linux, macOS)
3. Each provider can have its own config and test cases

## Troubleshooting

1. If you get module errors in a subdirectory, ensure the root `go.mod` is being found
2. For nested providers, run `promptfoo eval` from that directory
3. Check that `OPENAI_API_KEY` is set correctly

## Contributing

Feel free to add more provider examples or improve the existing ones. Keep in mind:

1. Focus on promptfoo-specific usage
2. Keep implementations simple and clear
3. Add appropriate test cases in configs
