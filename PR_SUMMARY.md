# PR Summary: Add Web Search Assertion Type

## Overview

This PR adds a new `web-search` assertion type to promptfoo, enabling quick verification of current information using web search capabilities across multiple providers.

## Changes

### Core Implementation

- Added `web-search` assertion type for real-time fact verification
- Created `src/assertions/webSearch.ts` handler
- Added `matchesWebSearch` function to `src/matchers.ts`
- Registered assertion in type definitions and handlers

### Provider Support

- Added web search capability detection for all major providers
- Created shared utilities in `src/providers/webSearchUtils.ts`
- Added `webSearchProvider` to default providers configuration
- Support for:
  - Anthropic Claude (built-in web search)
  - OpenAI Responses API (`web_search_preview` tool)
  - Google/Gemini (`googleSearch` tool)
  - Perplexity (built-in search)
  - xAI Grok (search parameters)

### Documentation

- Comprehensive documentation at `site/docs/configuration/expected-outputs/model-graded/web-search.md`
- Updated OpenAI provider docs with web search configuration
- Added blog post explaining the feature and use cases
- Documented cost implications and best practices

### Model Updates

- Updated all model IDs to July 2025 versions
- OpenAI: Using `o4-mini` as default
- Anthropic: `claude-sonnet-4`  
- Google: `gemini-2.5-flash`

## Example Usage

```yaml
# Basic usage
assert:
  - type: web-search
    value: 'current Bitcoin price USD'

# With provider configuration
providers:
  - id: openai:responses:o4-mini
    config:
      tools:
        - type: web_search_preview

tests:
  - vars:
      query: "What is the current weather in Tokyo?"
    assert:
      - type: web-search
        value: "Tokyo weather temperature humidity"
```

## Testing

- All TypeScript compilation passes
- Linting and formatting complete
- Build succeeds without errors

## Files Changed

- **Core**: `src/assertions/webSearch.ts`, `src/matchers.ts`, `src/types/index.ts`
- **Providers**: `src/providers/webSearchUtils.ts`, `src/providers/defaults.ts`, `src/providers/openai/defaults.ts`
- **Documentation**: `site/docs/configuration/expected-outputs/model-graded/web-search.md`, `site/blog/web-search-assertions.md`
- **Config**: `site/static/config-schema.json`
