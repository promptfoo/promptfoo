# google-aistudio-search

This example demonstrates using Google's Gemini 2.5 models with Search grounding to retrieve up-to-date information from the web.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`

## Overview

Search grounding allows Gemini models to access the internet to retrieve current information, making them more accurate for questions about recent events, facts, or real-time data. This improves responses that require:

- Current events and news
- Recent developments 
- Stock prices and market data
- Sports results
- Technical documentation updates

The example uses two approaches:
- Gemini 2.5 Flash with Google Search as a tool
- Gemini 2.5 Pro with thinking capabilities and Search grounding

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example google-aistudio-search
```

Or run it directly:

```bash
promptfoo eval -c examples/google-aistudio-search/promptfooconfig.yaml
```

## Configuration Examples

### Simple String Syntax (Recommended)

The simplest way to enable Google Search grounding is with the string format:

```yaml
providers:
  - id: google:gemini-2.5-flash-preview-04-17
    config:
      tools: ["google_search"]
```

### Object Syntax (Alternative)

You can also use the object-based syntax which matches Google's API format:

```yaml
providers:
  - id: google:gemini-2.5-flash-preview-04-17
    config:
      tools:
        - google_search: {}
```

## Example Queries

This example tests a variety of queries that benefit from search grounding:

1. "What is the current Google stock price?" - Current financial information
2. "What are the latest features in TypeScript?" - Technical updates
3. "Who won the most recent Super Bowl?" - Sports results

Try modifying the queries to test other real-time information use cases!

## Understanding the Results

When using Search grounding, the API response includes special metadata:

- `groundingMetadata` - Contains information about search results used
- `groundingChunks` - Web sources that informed the response
- `webSearchQueries` - Queries used to retrieve information
- `searchEntryPoint` - HTML for displaying Google Search Suggestions

## Requirements for Display

Per Google's requirements, if you use Search grounding in your own application, you must display Google Search Suggestions, which are included in the metadata of the grounded response.

## Example Files

- `promptfooconfig.yaml` - Main configuration showing how to enable search

## See Also

- [Google Provider Documentation](/docs/providers/google)
- [Google AI Studio documentation on Grounding with Google Search](https://ai.google.dev/docs/gemini_api/grounding)
