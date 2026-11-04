# provider-perplexity (Perplexity API Examples)

Compare Perplexity search models, validate structured JSON responses, and configure search filters.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-perplexity
cd provider-perplexity
```

## Features Demonstrated

- Real-time web search with academic citations
- Multiple specialized models for different use cases
- Structured outputs with JSON Schema
- Date-range and location-based search filtering
- Search domain filtering for trusted sources
- Deep research capabilities

## Environment Variables

This example requires the following environment variables:

- `PERPLEXITY_API_KEY` - Your Perplexity API key from [Perplexity Settings](https://www.perplexity.ai/settings/api)
- `OPENAI_API_KEY` - Your OpenAI API key (for comparison model in basic example)

You can set these in a `.env` file or directly in your environment:

```bash
export PERPLEXITY_API_KEY=your_api_key_here
export OPENAI_API_KEY=your_api_key_here
```

## Example Configurations

This example includes multiple configuration files to demonstrate different Perplexity features:

### 1. Basic Model Comparison (`promptfooconfig.yaml`)

Compares different Perplexity search models against a traditional non-search model (GPT-5 mini):

- `sonar`: Lightweight search model
- `sonar-pro`: Advanced search model with high context
- `sonar-reasoning-pro`: Advanced reasoning with step-by-step thinking

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

### 2. Structured Outputs (`promptfooconfig.structured-output.yaml`)

Demonstrates Perplexity's JSON Schema structured output capability for movie information.

```bash
npx promptfoo@latest eval -c promptfooconfig.structured-output.yaml
```

### 3. Advanced Search Filters (`promptfooconfig.search-filters.yaml`)

Shows how to use advanced search filtering options:

- Date range filtering for time-sensitive queries
- Location-based results for geographical context
- Domain filtering for trusted sources

```bash
npx promptfoo@latest eval -c promptfooconfig.search-filters.yaml
```

### 4. Research and Reasoning (`promptfooconfig.research-reasoning.yaml`)

Demonstrates specialized models for research and reasoning:

- `sonar-deep-research`: Research across multiple sources
- `sonar-reasoning-pro`: Reasoning with web search

```bash
npx promptfoo@latest eval -c promptfooconfig.research-reasoning.yaml
```

## Usage

After initializing the example, you can run any of the configurations:

```bash
cd provider-perplexity
npx promptfoo@latest eval -c <config-file.yaml>
npx promptfoo@latest view
```
