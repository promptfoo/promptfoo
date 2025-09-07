# Promptfoo Model Reference Audit

This document contains a review of the git diff, focusing on updating outdated model references in the promptfoo codebase.

## Summary of Findings

The git diff contains a large number of model reference updates across the `examples` and `site` directories. The changes aim to replace older model names with their newer counterparts. This audit verifies the correctness of these changes and identifies any missed updates.

A significant number of the updated model names are incorrect, referring to models that do not exist (e.g., `gpt-5`, `claude-opus-4-1`, `gemini-2.5-pro`). These appear to be speculative or placeholder names. All such instances are marked as **NEEDS REVIEW**.

## Detailed Review

### `examples/` directory

- **`examples/adaline-gateway/adaline-multi-provider/promptfooci-config.yaml`**:
  - `adaline:openai:chat:gpt-4o` -> `adaline:openai:chat:gpt-5`: **NEEDS REVIEW** - `gpt-5` is not a valid OpenAI model.
  - `adaline:anthropic:chat:claude-3-opus-20240229` -> `adaline:anthropic:chat:claude-opus-4-1`: **NEEDS REVIEW** - `claude-opus-4-1` is not a valid Anthropic model.
  - `adaline:google:chat:gemini-1.5-pro` -> `adaline:google:chat:gemini-2.5-pro`: **NEEDS REVIEW** - `gemini-2.5-pro` is not a valid Google model.
- **`examples/claude-vision/promptfooconfig.yaml`**:
  - `anthropic:messages:claude-3-haiku-20240307` -> `anthropic:messages:claude-3-5-haiku-latest`: **NEEDS REVIEW** - `claude-3-5-haiku-latest` is not a valid model. `claude-3-haiku-20240307` is correct.
  - `anthropic:messages:claude-3-5-sonnet-20240620` -> `anthropic:messages:claude-sonnet-4`: **NEEDS REVIEW** - `claude-sonnet-4` is not a valid model. `claude-3-5-sonnet-20240620` is correct.
  - `bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0` -> `bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0`: **NEEDS REVIEW** - Invalid model name.
- **`examples/google-vertex/promptfooconfig.yaml`**:
  - `vertex:gemini-1.5-flash` -> `vertex:gemini-2.5-flash`: **NEEDS REVIEW** - `gemini-2.5-flash` is not a valid Vertex AI model. `gemini-1.5-flash-latest` is the correct up-to-date model.
- **`examples/huggingface-hate-speech-detection/promptfooconfig.yaml`**:
  - `openai:gpt-4` -> `openai:gpt-5`: **NEEDS REVIEW** - `gpt-5` is not a valid model.
- **`examples/langchain-python/promptfooconfig.yaml`**:
  - `openai:chat:gpt-4o` -> `openai:chat:gpt-5`: **NEEDS REVIEW** - `gpt-5` is not a valid model.
- **`examples/ollama-comparison/promptfooconfig.yaml`**:
  - `openai:gpt-4.1-mini` -> `openai:gpt-5-mini`: **NEEDS REVIEW** - `gpt-5-mini` is not a valid model. `gpt-4o-mini` is the correct model.
- **`examples/openai-eval-factuality/promptfooconfig.yaml`**:
  - `openai:gpt-4.1-mini` -> `openai:gpt-5-mini`: **NEEDS REVIEW** - `gpt-5-mini` is not a valid model. `gpt-4o-mini` is the correct model.
- **`examples/redteam-ollama/promptfooconfig.yaml`**:
  - `ollama:chat:llama3.2` -> `ollama:chat:llama4`: **NEEDS REVIEW** - `llama4` is not a valid model.
- **`examples/replicate-llama-guard-moderation/promptfooconfig.yaml`**:
  - `openai:gpt-4o-mini` -> `openai:gpt-5-mini`: **NEEDS REVIEW** - `gpt-5-mini` is not a valid model.

### `site/` directory

- **`site/blog/ai-safety-vs-security.md`**:
  - `openai:gpt-4o-mini` -> `openai:gpt-4.1-mini`: **OK**, but `gpt-4o-mini` is the more common name.
  - `anthropic:claude-3-5-sonnet-latest` -> `anthropic:claude-sonnet-4`: **NEEDS REVIEW** - Invalid model.
  - `openai:gpt-5`: **NEEDS REVIEW** - Invalid model.
  - `anthropic:claude-4.1-opus` -> `anthropic:claude-opus-4-1`: **NEEDS REVIEW** - Invalid model.
- **Many files**: Numerous replacements of valid model names like `gpt-4`, `gpt-4o`, `gpt-4.1-mini`, `claude-3-opus`, etc., with invalid/speculative names like `gpt-5`, `gpt-5-mini`, `claude-opus-4-1`, etc. All these need to be reviewed and corrected.

### `src/` and `test/` directories

- **`src/app/src/pages/eval-creator/components/ProviderSelector.tsx`**:
  - `openrouter:google/gemini-1.5-pro` -> `openrouter:google/gemini-2.5-pro`: **NEEDS REVIEW** - `gemini-2.5-pro` is not a valid model on OpenRouter.
- **`src/app/src/pages/redteam/setup/components/Targets/FoundationModelConfiguration.test.tsx`**:
  - `google:gemini-1.5-pro` -> `google:gemini-2.5-pro`: **NEEDS REVIEW** - Invalid model.
- **`test/providers/google/ai.studio.test.ts`**:
  - `gemini-1.5-flash` -> `gemini-2.5-flash`: **NEEDS REVIEW** - Invalid model.
- **`test/providers/google/vertex.test.ts`**:
  - `gemini-1.5-flash` -> `gemini-2.5-flash`: **NEEDS REVIEW** - Invalid model.

## General Recommendations

1.  **Revert Invalid Model Names**: All instances of `gpt-5`, `gpt-5-mini`, `gpt-5.1`, `claude-opus-4-1`, `claude-sonnet-4`, `gemini-2.5-pro`, `gemini-2.5-flash`, and `llama4` should be reverted to their correct, existing counterparts.
2.  **Standardize Naming**: Decide on a consistent naming convention. For example, use `gpt-4o-mini` instead of `gpt-4.1-mini`.
3.  **Fact-check all model names**: Before merging, all model names should be cross-referenced with the official documentation from OpenAI, Anthropic, Google, and other providers.

## Missed Updates

I will now search for any remaining instances of the old model names to ensure nothing was missed.
