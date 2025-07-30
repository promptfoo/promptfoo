# PR Summary: Web Search Feature Implementation

## Overview

This PR adds a new `web-search` assertion type to promptfoo, enabling quick verification of current information using web search capabilities.

## What was done

### 1. **Implemented New `web-search` Assertion Type** ✅

- Created `src/assertions/webSearch.ts` handler
- Added `matchesWebSearch` function to `src/matchers.ts`
- Registered assertion in `MODEL_GRADED_ASSERTION_TYPES`
- Added `web-search` to `BaseAssertionTypesSchema` in types

### 2. **Code Quality Improvements** ✅

- Extracted duplicate `hasWebSearchCapability` function to `src/providers/webSearchUtils.ts`
- Created shared `loadWebSearchProvider` utility to eliminate code duplication
- Fixed inconsistent error messages across assertions
- Updated all model IDs to latest July 2025 versions:
  - Anthropic: `claude-sonnet-4`
  - OpenAI: `o4-mini`
  - Google: `gemini-2.5-flash`

### 3. **Documentation** ✅

- Created comprehensive documentation at `site/docs/configuration/expected-outputs/model-graded/web-search.md`
- Updated model-graded index to include web-search
- Updated OpenAI provider docs with web search examples
- Documented use cases, provider configurations, and cost considerations

### 4. **Testing & Validation** ✅

- Fixed all TypeScript compilation errors
- All linting checks pass
- Code formatting applied

## Key Features

### Web Search Assertion

- Quick verification of current information
- Simpler alternative to more comprehensive fact-checking
- Supports all major providers with web search capabilities:
  - Anthropic: Built-in web search (no configuration needed)
  - OpenAI: `web_search_preview` tool
  - Google/Gemini: `googleSearch` tool
  - Perplexity: Built-in web search

### Provider Support

- Automatic detection of web search capabilities
- Fallback to appropriate providers when web search is needed
- Support for Anthropic's built-in web search

## Issues Addressed

1. ✅ Fixed OpenAI using correct tool type (`web_search_preview`)
2. ✅ Corrected Anthropic web search capabilities comments
3. ✅ Eliminated code duplication with shared utilities
4. ✅ Standardized error messages
5. ✅ Updated to latest model versions

## Example Usage

```yaml
assert:
  - type: web-search
    value: 'current Bitcoin price USD'
```

## Provider Configuration

```yaml
# Anthropic (no config needed)
providers:
  - anthropic:messages:claude-sonnet-4

# OpenAI with web search
providers:
  - id: openai:responses:o4-mini
    config:
      tools:
        - type: web_search_preview

# Google with search
providers:
  - id: google:gemini-2.5-flash
    config:
      tools:
        - googleSearch: {}
```

## PR Readiness: ✅ READY

The implementation is complete, follows established patterns, and addresses all requirements. The code:

- Compiles without errors
- Passes linting and formatting checks
- Includes comprehensive documentation
- Uses the latest model versions
- Follows consistent patterns throughout

### Files Changed

- 11 files modified/added
- Key additions: web search assertion, provider utils, documentation
- No breaking changes to existing functionality
