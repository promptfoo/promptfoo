# ollama (Ollama Examples)

This directory contains examples demonstrating different capabilities of Ollama with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example ollama
```

## Prerequisites

1. Install [Ollama](https://ollama.ai)
2. Pull the required models:

```bash
# For comparison example (default)
ollama pull llama3.3
ollama pull llama2-uncensored

# For function calling example
ollama pull llama3.2:1b
```

## Available Examples

This directory contains two different Ollama examples:

### 1. Model Comparison (Default)

**Config**: `promptfooconfig.yaml`

Compares different Ollama models (llama3.3, llama2-uncensored) with OpenAI models using various prompts and assertions.

**Running**:

```bash
npx promptfoo@latest eval
```

Or with a specific config:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

**What this tests**:

- Compares uncensored vs standard models
- Tests with controversial/edge-case questions
- Validates models don't refuse legitimate queries
- Demonstrates prompt format differences (Llama vs OpenAI)

**Tutorial**: See the accompanying guide at https://promptfoo.dev/docs/guides/llama2-uncensored-benchmark-ollama/

### 2. Function Calling

**Config**: `promptfooconfig.function-calling.yaml`

Demonstrates Ollama's function calling capabilities using a tiny 1B parameter model.

**Running**:

```bash
npx promptfoo@latest eval -c promptfooconfig.function-calling.yaml
```

**What this tests**:

- Function calling with `llama3.2:1b` (tiny, fast model)
- OpenAI-compatible tool format
- Weather API function example with location extraction
- Validates tool calls with `is-valid-openai-tools-call` assertion

**Expected output**:

```
✔ Evaluation complete
Pass Rate: 100.00%
Successes: 3
```

Each test generates a tool call:

```json
[
  {
    "function": {
      "name": "get_current_weather",
      "arguments": "{\"location\":\"Boston\",\"unit\":\"celsius\"}"
    }
  }
]
```

**Supported models**: Models with function calling support include `llama3.2:1b`, `llama3.2:3b`, `llama3.1`, `llama3.3`, and `qwen2.5`.

## Customization

### For Comparison Example

Edit the prompts and test cases in `promptfooconfig.yaml`. You can modify:

- Models being compared
- Test questions in the `tests` section
- Assertions to validate different behaviors
- Prompt formats in the `prompts/` directory

### For Function Calling Example

Edit `promptfooconfig.function-calling.yaml` to:

- Change the test cities
- Modify the tool definition in `get_current_weather.yaml`
- Add additional functions
- Test with different models

## File Structure

```
examples/ollama/
├── README.md                              # This file
├── promptfooconfig.yaml                   # Model comparison (default)
├── promptfooconfig.function-calling.yaml  # Function calling example
├── prompts/
│   ├── llama_prompt.txt                   # Llama-style prompt format
│   └── openai_prompt.json                 # OpenAI chat format
├── prompts.txt                            # Additional prompt examples
└── get_current_weather.yaml               # Tool definition for function calling
```

## Viewing Results

After running an evaluation, view the results in the web UI:

```bash
npx promptfoo@latest view
```

This opens an interactive comparison showing:

- Side-by-side model outputs
- Pass/fail status for each assertion
- Token usage and latency metrics
