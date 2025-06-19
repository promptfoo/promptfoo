# pydantic-ai (PydanticAI Agent Evaluation)

This example demonstrates how to evaluate [PydanticAI](https://ai.pydantic.dev/) agents using promptfoo. PydanticAI is a Python agent framework that makes it easier to build production-grade applications with Generative AI using structured outputs and type safety.

You can run this example with:

```bash
npx promptfoo@latest init --example pydantic-ai
```

## What This Example Shows

- Creating a PydanticAI agent with tools and structured outputs
- Using promptfoo's Python provider to evaluate PydanticAI agents
- Testing different model providers through the same agent interface
- Evaluating structured outputs and tool usage
- Performance testing and LLM-based quality assessment

## Prerequisites

- Python 3.9+
- Node.js for promptfoo
- OpenAI API key (required)
- Anthropic API key (optional)

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- `ANTHROPIC_API_KEY` - Your Anthropic API key from [Anthropic Console](https://console.anthropic.com/) (optional)

You can set these in a `.env` file in your project root:

```bash
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Or set them directly in your environment:

```bash
export OPENAI_API_KEY=your_openai_api_key_here
export ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Quick Start

### Option 1: Using the init command (recommended)

```bash
npx promptfoo@latest init --example pydantic-ai
cd pydantic-ai
export OPENAI_API_KEY=your_openai_api_key_here
pip install -r requirements.txt
npx promptfoo@latest eval --no-cache
npx promptfoo@latest view
```

### Option 2: Manual setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key (if not already in .env)
export OPENAI_API_KEY=your_openai_api_key_here

# Run the evaluation
npx promptfoo@latest eval --no-cache

# View results in the web UI
npx promptfoo@latest view
```

**Note**: Use `--no-cache` flag when testing latency assertions to get accurate timing measurements.

## Local Development

When working on this example or testing with local changes to promptfoo:

```bash
# Use the local version instead of the published package
npm run local -- eval --no-cache

# For specific configuration files
npm run local -- eval -c promptfooconfig.yaml --no-cache
```

## Example Structure

- `agent.py` - PydanticAI agent with weather tools and structured output
- `provider.py` - Promptfoo Python provider that runs the PydanticAI agent
- `promptfooconfig.yaml` - Evaluation configuration with multiple test scenarios
- `requirements.txt` - Python dependencies
- `README.md` - This documentation

## What Gets Evaluated

The example evaluates a weather assistant agent that:

1. **Accepts location queries** - Users can ask about weather in different cities
2. **Uses geocoding tools** - Converts location names to coordinates
3. **Fetches weather data** - Gets current weather information
4. **Returns structured output** - Provides consistent, typed responses

## Evaluation Criteria

This example demonstrates multiple evaluation patterns:

### Structured Output Validation

- **Type checking** - Ensures responses match expected schema
- **Field presence** - Verifies all required fields are populated
- **JSON structure** - Validates proper data structure

### Functional Testing

- **Location detection** - Verifies the agent correctly identifies cities
- **Tool usage** - Confirms proper use of geocoding and weather tools
- **Cross-model consistency** - Compares behavior across different LLMs

### Quality Assessment

- **LLM-based rubrics** - Uses AI to evaluate response quality
- **Decision support** - Tests actionable advice provision
- **Error handling** - Validates graceful handling of edge cases

### Performance Testing

- **Latency thresholds** - Ensures responses within acceptable time limits
- **Complex queries** - Tests performance with multi-part requests

## Expected Results

When you run the evaluation, you'll see results for:

- ✅ Basic weather queries (location detection, temperature reporting)
- ✅ Structured output format compliance
- ✅ Tool usage accuracy
- ✅ Response quality and usefulness
- ✅ Performance benchmarks
- ✅ Error handling

Example output:

```
Successes: 6, Failures: 0, Errors: 0
Pass Rate: 100.00%
Duration: 9s (concurrency: 4)
Token Usage: 678 tokens total
```

## Customizing the Example

### Adding New Test Cases

Edit `promptfooconfig.yaml` to add more test scenarios:

```yaml
tests:
  - description: 'Your custom test'
    vars:
      query: 'Your weather question'
    assert:
      - type: javascript
        value: 'your_validation_logic'
```

### Testing Different Models

Add more providers to compare additional models:

```yaml
providers:
  - id: file://provider.py
    config:
      model: anthropic:claude-3-5-sonnet-latest
  - id: file://provider.py
    config:
      model: openai:gpt-4.1
```

### Real API Integration

To use real weather APIs instead of mock data:

1. Get API keys from weather services (e.g., Tomorrow.io, OpenWeatherMap)
2. Set environment variables: `WEATHER_API_KEY`, `GEO_API_KEY`
3. The agent will automatically use real APIs when keys are available

## Troubleshooting

| Issue                   | Solution                                                 |
| ----------------------- | -------------------------------------------------------- |
| Module not found errors | Ensure dependencies installed and Python path correct    |
| API key errors          | Verify environment variables are set                     |
| Timeout errors          | Increase latency thresholds or optimize performance      |
| Inconsistent results    | Add deterministic test cases, check for model randomness |

## Next Steps

- Explore the comprehensive [PydanticAI evaluation guide](../../site/docs/guides/pydantic-ai-evaluation.md)
- Set up continuous evaluation in your CI/CD pipeline
- Compare with other agent frameworks
- Build custom evaluation metrics for your specific use case
