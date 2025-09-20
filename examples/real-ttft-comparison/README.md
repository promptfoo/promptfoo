# Real TTFT Comparison Example

This example demonstrates how to compare Time to First Token (TTFT) performance between different OpenAI models using real API calls.

## What This Example Shows

- **TTFT Measurement**: Compare streaming response times between models
- **Real-World Testing**: Uses actual OpenAI API endpoints with current models
- **Performance Analysis**: Measures both TTFT and total latency across multiple test cases
- **Model Comparison**: Side-by-side performance evaluation of GPT-5 nano vs GPT-5

## Configuration

The example tests both models with:
- **GPT-5 nano**: Fastest, most cost-efficient model
- **GPT-5**: Flagship model with advanced capabilities

Each provider is configured with:
```yaml
config:
  enableStreamingMetrics: true  # Required for TTFT measurement
  stream: true                  # Enable streaming from OpenAI API
```

## Running the Example

1. **Set your OpenAI API key**:
   ```bash
   export OPENAI_API_KEY="your-api-key"
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
- **GPT-5 nano TTFT**: ~100-400ms (optimized for speed)
- **GPT-5 TTFT**: ~200-600ms (balanced performance)
- **Total Response Time**: 2-8 seconds depending on complexity

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