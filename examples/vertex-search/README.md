# vertex-search

This example demonstrates using Google's Vertex AI with Gemini models and Search grounding to retrieve up-to-date information from the web.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google Cloud credentials set up in one of these ways:
  - `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to a service account key file
  - Using `gcloud auth application-default login`
- Your Google Cloud project must have:
  - Vertex AI API enabled
  - Appropriate quotas for Gemini models

## Overview

Search grounding allows Gemini models on Vertex AI to access the internet to retrieve current information, making them more accurate for questions about recent events, facts, or real-time data. This improves responses that require:

- Current events and news
- Recent developments
- Stock prices and market data
- Sports results
- Technical documentation updates

The example uses two approaches:

- Gemini 2.0 Pro with Google Search as a tool
- Gemini 2.5 Flash with thinking capabilities and Search grounding

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example vertex-search
```

Or run it directly:

```bash
promptfoo eval -c examples/vertex-search/promptfooconfig.yaml
```

## Configuration Examples

### Simple String Syntax (Recommended)

The simplest way to enable Search grounding is with the string format:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      tools: ['google_search']
```

### Object Syntax (Alternative)

You can also use the object-based syntax which matches Google's API format:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      tools:
        - google_search: {}
```

## Example Queries

This example tests a variety of queries that benefit from search grounding:

1. "What is the current Google stock price?" - Current financial information
2. "What are the latest features in Python 3.13?" - Technical updates
3. "Who won the latest Formula 1 Grand Prix?" - Sports results

Try modifying the queries to test other real-time information use cases!

## Understanding the Results

When using Search grounding, the API response includes special metadata:

- `groundingMetadata` - Contains information about search results used
- `groundingChunks` - Web sources that informed the response
- `webSearchQueries` - Queries used to retrieve information
- `searchEntryPoint` - HTML for displaying Google Search Suggestions

## Requirements for Display

Per Google's requirements, if you use Search grounding in your own application, you must display Google Search Suggestions, which are included in the metadata of the grounded response.

## Differences from Google AI Studio

While the functionality is similar to the Google AI Studio provider, there are some differences when using Vertex AI:

- Authentication uses Google Cloud credentials instead of an API key
- Models are accessed through Vertex AI endpoints rather than Google AI Studio
- Project ID and region need to be configured

## See Also

- [Vertex AI Provider Documentation](/docs/providers/vertex)
- [Google documentation on Grounding with Google Search](https://ai.google.dev/docs/gemini_api/grounding)
