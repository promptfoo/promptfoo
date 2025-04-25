# google-aistudio-search

This example demonstrates using Google's Gemini models with Search grounding to retrieve up-to-date information from the web.

## Overview

Search grounding allows Gemini models to access the internet to retrieve current information, making them more accurate for questions about recent events, facts, or real-time data. This improves responses that require:

- Current events and news
- Recent developments 
- Stock prices and market data
- Sports results
- Technical documentation updates

The example uses two approaches:
- Search as a tool for Gemini 2.0 models
- Search retrieval with dynamic threshold for Gemini 1.5 models

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example google-aistudio-search
```

Or run it directly:

```bash
promptfoo eval -c examples/google-aistudio-search/promptfooconfig.yaml
```

## Example Queries

This example tests a variety of queries that benefit from search grounding:

1. Current stock price information
2. Latest technical feature updates
3. Recent sports results

## Expected Results

The example includes assertions to verify that:

1. The responses contain relevant content
2. The API returns grounding metadata that includes search results

When successful, the response will include special `groundingMetadata` with web search references that were used to generate the response.

## Requirements for Display

Per Google's requirements, if you use Search grounding in your own application, you must display Google Search Suggestions, which are included in the metadata of the grounded response.

For more information, see the [Google AI Studio documentation](https://ai.google.dev/docs/gemini_api/grounding). 