# openai-deep-research (OpenAI Deep Research Models Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-deep-research
```

This example demonstrates how to use OpenAI's new deep research models via the **Responses API** with web search capabilities.

:::warning Experimental Models
Deep research models (`o3-deep-research` and `o4-mini-deep-research`) are newly announced and may not be fully available or functional in the OpenAI API yet. This example serves as a demonstration of the intended configuration and may require updates as the models become fully available.
:::

## What This Example Shows

- **o4-mini-deep-research**: Deep research model with web search access
- **Research capabilities**: Demonstrates how to configure research tasks
- **Web search integration**: Shows proper tool configuration for web search

## Features Demonstrated

- **Web search**: The model can search the internet for current information
- **Current events**: Research topics that change frequently
- **Automatic tool use**: The model decides when to search for information
- **Quality assessment**: Uses LLM rubric to evaluate research depth

## Prerequisites

- promptfoo CLI installed
- OpenAI API key set as `OPENAI_API_KEY` environment variable
- Access to the deep research models

## Configuration

The example uses a simple configuration with:

- **Web search preview**: For internet research on current topics
- **Automatic search**: The model decides when to search based on the query

## Running the Example

1. Initialize the example:

   ```bash
   npx promptfoo@latest init --example openai-deep-research
   ```

2. Run the evaluation:

   ```bash
   promptfoo eval
   ```

3. View results:
   ```bash
   promptfoo view
   ```

## What's Being Tested

This example tests basic research capabilities:

- **Topic**: "Python programming language"
- **Task**: The model researches Python and provides a summary
- **Tools**: The model can use web search to find information

The test verifies that:

- The response contains relevant terms about Python programming
- The response demonstrates research capabilities (via LLM rubric)
- The response is text format (not JSON)

## Expected Results

The deep research model should:

- **Search the web** for information about Python when needed
- **Provide a comprehensive summary** using available information
- **Demonstrate tool integration** by automatically using web search

## Configuration Details

The example uses this simple configuration:

```yaml
providers:
  - id: openai:responses:o4-mini-deep-research
    config:
      max_output_tokens: 20000
      tools:
        - type: web_search_preview
```

**Key points**:

- The model automatically chooses when to use web search
- High token limit (20,000) for deep research and reasoning
- Simple tool configuration for web search capabilities

## Learn More

- [OpenAI Deep Research Guide](https://platform.openai.com/docs/guides/deep-research)
- [Promptfoo Documentation](https://promptfoo.dev/docs)
