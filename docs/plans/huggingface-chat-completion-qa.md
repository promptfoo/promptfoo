# HuggingFace Chat Completion Support - QA Plan

## Overview

This plan tests the new chat completion format support added to the HuggingFace text-generation provider. The feature allows using HuggingFace's OpenAI-compatible `/v1/chat/completions` endpoint.

## Changes Made

1. Added `chatCompletion` config option to `HuggingfaceTextGenerationProvider`
2. Auto-detection: URLs containing `/v1/chat/completions` automatically use chat format
3. New `callChatCompletionApi()` method for OpenAI-compatible requests
4. Parameter mapping: `max_new_tokens` → `max_tokens`, etc.

## Test Matrix

### 1. Chat Completion Format (New Feature)

| Test Case            | Model       | Endpoint               | Config                          | Expected              |
| -------------------- | ----------- | ---------------------- | ------------------------------- | --------------------- |
| Auto-detect from URL | DeepSeek-R1 | `/v1/chat/completions` | None                            | Uses chat format      |
| Explicit enable      | Any model   | Custom endpoint        | `chatCompletion: true`          | Uses chat format      |
| Explicit disable     | Any model   | `/v1/chat/completions` | `chatCompletion: false`         | Uses Inference format |
| Parameter mapping    | Any model   | `/v1/chat/completions` | `temperature`, `max_new_tokens` | Maps to OpenAI params |

### 2. Inference API Format (Existing - Regression Tests)

| Test Case                  | Model | Endpoint                      | Expected                |
| -------------------------- | ----- | ----------------------------- | ----------------------- |
| Default endpoint           | gpt2  | Default (hf-inference)        | Uses Inference format   |
| Custom endpoint (non-chat) | Any   | Custom URL without `/v1/chat` | Uses Inference format   |
| Environment token          | Any   | Default                       | Uses `HF_TOKEN` env var |

### 3. Models to Test

#### Chat Completion Endpoint Models

- `deepseek-ai/DeepSeek-R1` - User's original model
- `meta-llama/Llama-3.3-70B-Instruct` - Popular open model
- `mistralai/Mistral-7B-Instruct-v0.3` - Mistral model

#### Inference API Models (Regression)

- `gpt2` - Simple text generation
- `microsoft/DialoGPT-medium` - Conversational model

## Test Configurations

### Test 1: Chat Completion Auto-Detection

```yaml
# examples/huggingface-chat/promptfooconfig.yaml
providers:
  - id: huggingface:text-generation:deepseek-ai/DeepSeek-R1
    config:
      apiEndpoint: https://router.huggingface.co/v1/chat/completions
    label: DeepSeek-R1 (Chat)

prompts:
  - 'What is 2+2? Answer with just the number.'

tests:
  - vars: {}
    assert:
      - type: contains
        value: '4'
```

### Test 2: Explicit Chat Completion

```yaml
providers:
  - id: huggingface:text-generation:meta-llama/Llama-3.3-70B-Instruct
    config:
      apiEndpoint: https://router.huggingface.co/v1/chat/completions
      chatCompletion: true
      temperature: 0.1
      max_new_tokens: 50
    label: Llama-3.3-70B (Chat)
```

### Test 3: Inference API (Regression)

```yaml
providers:
  - id: huggingface:text-generation:gpt2
    label: GPT-2 (Inference API)

prompts:
  - 'The capital of France is'

tests:
  - vars: {}
    assert:
      - type: contains
        value: 'Paris'
```

### Test 4: Mixed Providers

```yaml
providers:
  - id: huggingface:text-generation:deepseek-ai/DeepSeek-R1
    config:
      apiEndpoint: https://router.huggingface.co/v1/chat/completions
    label: DeepSeek (Chat)

  - id: huggingface:text-generation:gpt2
    label: GPT-2 (Inference)
```

## Execution Steps

### Step 1: Build the Project

```bash
npm run build
```

### Step 2: Run Unit Tests

```bash
npx vitest run test/providers/index.test.ts -t "HuggingfaceTextGenerationProvider"
```

### Step 3: Run Integration Tests

```bash
# Test chat completion with DeepSeek
npm run local -- eval -c examples/huggingface-chat/promptfooconfig.yaml --env-file .env --no-cache -o /tmp/hf-chat-test.json

# Verify results
cat /tmp/hf-chat-test.json | jq '.results.results[0]'
```

### Step 4: Verify Request Format

Enable debug logging to verify correct request format:

```bash
LOG_LEVEL=debug npm run local -- eval -c examples/huggingface-chat/promptfooconfig.yaml --env-file .env --no-cache 2>&1 | grep -A5 "Huggingface"
```

Expected for chat completion:

```
Huggingface chat completion API request: https://router.huggingface.co/v1/chat/completions
params: { model: 'deepseek-ai/DeepSeek-R1', messages: [...] }
```

Expected for Inference API:

```
Huggingface API request: https://router.huggingface.co/hf-inference/models/gpt2
params: { inputs: '...', parameters: {...} }
```

## Success Criteria

1. **Unit tests pass** - All 7 HuggingFace tests (including new chat completion tests)
2. **Chat completion works** - DeepSeek-R1 returns valid response via chat endpoint
3. **Inference API still works** - GPT-2 returns valid response via default endpoint
4. **Auto-detection works** - URLs with `/v1/chat/completions` use chat format automatically
5. **Explicit config works** - `chatCompletion: true/false` overrides auto-detection
6. **Parameter mapping works** - `max_new_tokens` becomes `max_tokens` in chat requests
7. **Error handling works** - Invalid models return clear error messages

## Known Limitations

1. Not all HuggingFace models support the chat completions endpoint
2. Some models may have rate limits or require Pro subscription
3. The chat completions endpoint may have different parameter support than OpenAI

## Rollback Plan

If issues are found:

1. Revert changes to `src/providers/huggingface.ts`
2. Revert test changes in `test/providers/index.test.ts`
3. Document the issue for future fix
