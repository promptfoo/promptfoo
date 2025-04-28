# google-aistudio-tools

This example demonstrates how to use Google AI Studio's function calling, code execution, and search capabilities with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example google-aistudio-tools
```

## Prerequisites

- Google AI Studio API key set as `GOOGLE_API_KEY` in your environment

## Overview

This example shows how to:

1. **Function Calling**: Use Gemini to invoke predefined functions based on user queries
2. **Google Search Integration**: Get up-to-date information from the web using Gemini models with search grounding
3. **Code Execution**: Generate and execute Python code for solving problems and data analysis

## Function Calling Example

The function calling configuration (`promptfooconfig.yaml`) demonstrates:

- Defining a weather function in `tools.json`
- Validating that Gemini models correctly produce structured function calls
- Testing that the location parameter matches the user's query

Run with:

```bash
promptfoo eval -c promptfooconfig.yaml
```

## Search Grounding Example

The search grounding configuration (`promptfooconfig.search.yaml`) demonstrates:

- Using Gemini 2.5 Flash with Google Search as a tool
- Using Gemini 2.5 Pro with thinking capabilities and Search grounding
- Using Gemini 1.5 Flash with dynamic retrieval configuration
- Testing queries that benefit from real-time web information
- Verifying responses include relevant information

Run with:

```bash
promptfoo eval -c promptfooconfig.search.yaml
```

## Code Execution Example

The code execution configuration (`promptfooconfig.code.yaml`) demonstrates:

- Using Gemini models to generate and execute Python code
- Solving mathematical problems with code
- Creating visualizations using matplotlib
- Performing statistical analysis on data
- Displaying code and execution results in output

Run with:

```bash
promptfoo eval -c promptfooconfig.code.yaml
```

## Example Files

- `promptfooconfig.yaml`: Function calling configuration
- `promptfooconfig.search.yaml`: Search grounding configuration
- `promptfooconfig.code.yaml`: Code execution configuration
- `tools.json`: Function definition for the weather example

## Notes on Google Search Integration

When using Search grounding in your own applications:

- The API response includes search metadata and sources
- Google requires displaying "Google Search Suggestions" in user-facing apps
- Models can retrieve current information about events, prices, and technical updates

### Search Methods

This example demonstrates three approaches to search:

1. **Search as a tool** (Gemini 2.5): Allows the model to decide when to use search

   ```yaml
   tools:
     - google_search: {}
   ```

2. **Search with thinking** (Gemini 2.5): Adds thinking capabilities for better reasoning

   ```yaml
   generationConfig:
     thinkingConfig:
       thinkingBudget: 1024
   tools:
     - google_search: {}
   ```

3. **Dynamic retrieval** (Gemini 1.5): Controls when to use search with threshold settings
   ```yaml
   tools:
     - googleSearchRetrieval:
         dynamicRetrievalConfig:
           mode: 'MODE_DYNAMIC'
           dynamicThreshold: 0 # 0 = always use search, 1 = never use search
   ```

## Notes on Code Execution

When using code execution in your applications:

- Only Python is supported for execution
- The model decides when to use code execution to solve a problem
- Code is executed in a secure sandbox environment
- Included libraries: matplotlib, numpy, pandas, sympy, and more
- Maximum execution time: 30 seconds

## Further Resources

- [Google AI Studio Function Calling documentation](https://ai.google.dev/docs/function_calling)
- [Google AI Studio Search Grounding documentation](https://ai.google.dev/docs/gemini_api/grounding)
- [Google AI Studio Code Execution documentation](https://ai.google.dev/docs/gemini_api/code_execution)
- [promptfoo Google Provider documentation](/docs/providers/google)
