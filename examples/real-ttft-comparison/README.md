# real-ttft-comparison

This example demonstrates how to compare Time to First Token (TTFT) performance between different OpenAI models using real API calls.

## Quick Start

Initialize this example with:

```bash
npx promptfoo@latest init --example real-ttft-comparison
```

## What This Example Shows

- **TTFT Measurement**: Compare streaming response times between models
- **Real-World Testing**: Uses actual OpenAI API endpoints with current models
- **Performance Analysis**: Measures both TTFT and total latency across multiple test cases
- **Model Comparison**: Side-by-side performance evaluation of gpt-5-mini vs gpt-5

## Configuration

The example tests both models with:

- **gpt-5-mini**: Fast, cost-efficient model optimized for speed
- **gpt-5**: Flagship model with advanced reasoning capabilities

Each provider is configured with:

```yaml
config:
  body:
    stream: true # Automatically enables TTFT measurement
```

## Requirements

- **OpenAI API Key**: Required to access OpenAI's API
  - Sign up at [OpenAI Platform](https://platform.openai.com/)
  - Navigate to the API Keys section
  - Create a new secret key

## Running the Example

1. **Set your OpenAI API key**:

   ```bash
   export OPENAI_API_KEY="your-api-key"
   ```

   Or create a `.env` file in the project root:

   ```
   OPENAI_API_KEY=your-api-key-here
   ```

2. **Run the comparison**:

   ```bash
   promptfoo eval -c examples/real-ttft-comparison/promptfooconfig.yaml
   ```

3. **View detailed results**:
   ```bash
   promptfoo view
   ```

## Expected Results

### Performance Characteristics

- **gpt-5-mini TTFT**: ~200-600ms (optimized for speed)
- **gpt-5 TTFT**: ~300-800ms (balanced performance)
- **Total Response Time**: 2-8 seconds depending on response length

### Test Coverage

- 10 diverse topics across different domains
- Multiple assertion types (content quality + performance)
- Comprehensive TTFT vs latency comparison

## Understanding the Results

The evaluation provides insights into:

- **User Experience**: How quickly users see responses start
- **Cost vs Performance**: Speed differences between model tiers
- **Production Planning**: Which model meets your latency requirements

## Use Cases

This example is valuable for:

- **Model Selection**: Choose the right model for your latency requirements
- **Performance Benchmarking**: Establish baseline TTFT metrics
- **Production Readiness**: Validate streaming performance before deployment
- **Cost Optimization**: Balance speed vs cost for your use case

## Notes

- **Live API**: This example makes real API calls (no caching with streaming metrics)
- **API Costs**: Multiple test cases will consume OpenAI API credits
- **Network Dependency**: Results may vary based on network latency to OpenAI servers
