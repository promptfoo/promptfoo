# Outdated Code Patterns Found in Documentation and Examples

## 1. Outdated `import('promptfoo')["providers"]` syntax

### Found in:
- **site/docs/providers/openai.md:711** - OpenAI Assistants example using deprecated syntax

**Issue**: Uses `InstanceType<import('promptfoo')["providers"]["OpenAiAssistantProvider"]>["config"]`

**Fix**: This type syntax is no longer supported. Should be replaced with proper import or removed entirely.
**Status**: ✅ FIXED - Removed deprecated type syntax

## 2. OpenAI Assistants examples manually parsing JSON

### Found in:
- **site/docs/providers/openai.md:738** - OpenAI Assistants function callback example
- **examples/azure-openai-assistant/callbacks/weather.js** - Azure OpenAI Assistant callback parsing JSON

**Issue**: The examples show manual JSON parsing: `const { a, b } = JSON.parse(parametersJsonString);`

**Fix**: According to PR #4987, the OpenAI Assistants provider now parses JSON automatically, so the parameter should already be an object.
**Status**: ✅ FIXED - Updated both examples to receive pre-parsed objects

## 3. OpenAI function call examples that could potentially use structured outputs

### Found in:
- **examples/openai-function-call/promptfooconfig.yaml** - Uses JSON.parse on function arguments
- **examples/openai-tools-call/promptfooconfig.yaml** - Uses JSON.parse on function arguments
- **site/docs/providers/openai.md** - Multiple examples showing JSON.parse usage
- **examples/adaline-gateway/adaline-tool-call/promptfooconfig.yaml** - Uses JSON.parse
- **examples/adaline-gateway/adaline-openai-format/promptfooconfig.yaml** - Uses JSON.parse

**Issue**: These examples still use `JSON.parse(output.arguments)` or similar patterns. With OpenAI's structured outputs feature, this might not be necessary if configured properly.

**Note**: These may still be valid depending on whether structured outputs are enabled. The OpenAI function calling examples are different from the Assistants API and may still require JSON.parse for non-structured outputs.
**Status**: ℹ️ NO ACTION TAKEN - These examples are for regular function calling, not Assistants API

## 4. Potential model name issues

### Observation:
- Throughout the codebase, there are references to `gpt-4.1` model names (e.g., `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`)
- These appear to be valid model names used by promptfoo, not typos
**Status**: ℹ️ NO ACTION NEEDED - Valid model names

## Summary of Changes Made

1. **✅ COMPLETED**: Fixed OpenAI Assistants documentation in `site/docs/providers/openai.md`:
   - Line 711: Removed deprecated type syntax
   - Line 738: Updated function callback to show it receives an already-parsed object

2. **✅ COMPLETED**: Fixed Azure OpenAI Assistant example:
   - Updated `examples/azure-openai-assistant/callbacks/weather.js` to receive pre-parsed object

3. **ℹ️ NO ACTION**: OpenAI function calling examples left as-is (different from Assistants API)

4. **ℹ️ NO ACTION**: `gpt-4.1` references are valid model names