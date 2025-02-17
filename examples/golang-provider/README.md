# Golang Provider Examples

This directory demonstrates how to use Go with promptfoo, specifically addressing the module resolution issue described in [#3057](https://github.com/promptfoo/promptfoo/issues/3057).

## Directory Structure

```
golang-provider/
├── go.mod                  # Root module definition
├── go.sum
├── core/                  # Core functionality
│   └── openai.go         # OpenAI client wrapper
├── pkg1/                  # Example package 1
│   └── utils.go          # Utility functions
├── pkg2/                  # Example package 2 (for future use)
├── evaluation/           # Provider implementation
│   ├── main.go          # Provider that imports from parent
│   └── promptfooconfig.yaml
├── main.go               # Root example using the provider
└── promptfooconfig.yaml  # Root config using evaluation provider
```

This structure demonstrates:

1. How to implement a provider that imports packages from parent directories
2. How to handle Go module resolution when running `promptfoo eval` from subdirectories
3. How to structure a Go project with shared packages

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

### Running from Evaluation Directory

This example demonstrates the module resolution issue when running from a subdirectory:

```sh
cd evaluation
npx promptfoo eval  # This will fail with "go.mod file not found"
```

This shows:

- The issue where promptfoo cannot find the root go.mod
- How imports from parent directories should work
- The need to fix module resolution in promptfoo

### Running from Root Directory

This works correctly:

```sh
npx promptfoo eval
```

## Implementation Details

### Core Package (`core/openai.go`)

- Wraps the OpenAI client
- Provides temperature control
- Imported by evaluation provider

### Utility Package (`pkg1/utils.go`)

- Provides shared utility functions
- Demonstrates cross-package imports
- Used by both core and evaluation packages

### Evaluation Provider (`evaluation/main.go`)

- Located in evaluation directory to match issue #3057
- Imports packages from parent directories
- Shows proper module import patterns

## Configuration Examples

1. Root config (works):

```yaml
providers:
  - id: file://evaluation/main.go:CallApi
    config:
      temperature: 0.7
```

2. Evaluation config (fails):

```yaml
providers:
  - id: file://main.go:CallApi
    config:
      temperature: 0.2
```

## Troubleshooting

1. Ensure `OPENAI_API_KEY` is set correctly
2. Module errors from subdirectories:
   - This is a known issue (#3057)
   - The root cause is promptfoo assuming go.mod is in the same directory as the script
   - A fix is needed in promptfoo/src/providers/golangCompletion.ts
3. For provider paths:
   - From root: use `file://evaluation/main.go`
   - From evaluation dir: use `file://main.go` (but this will fail due to #3057)
