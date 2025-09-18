# http-provider-streaming

⚠️ **Important: Streaming is NOT Recommended**

This example demonstrates using the HTTP provider with OpenAI's API, but **streaming is not recommended** because:

1. **No streaming benefits**: The evaluation tool waits for the entire response to complete anyway
2. **Added complexity**: HTTP provider requires more configuration than built-in providers
3. **No performance gains**: Similar latency to non-streaming requests during evaluation

**🎯 Recommended approach**: Use the built-in OpenAI provider (`openai:responses:gpt-5-mini`) instead.

## Purpose

This example demonstrates:
- How to configure HTTP provider with OpenAI's Chat Completions API
- Why streaming doesn't provide benefits during evaluation
- Side-by-side comparison with the recommended built-in provider approach

## Environment Variables

Required:
- `OPENAI_API_KEY` - Your OpenAI API key from https://platform.openai.com/api-keys

Set it in your environment:
```bash
export OPENAI_API_KEY="your-key-here"
```

Or create a `.env` file:
```
OPENAI_API_KEY=your-key-here
```

## Quick Start

1. **Set your API key:**
   ```bash
   export OPENAI_API_KEY="your-openai-api-key"
   ```

2. **Run the evaluation:**
   ```bash
   npx promptfoo@latest eval
   ```

3. **View results:**
   ```bash
   npx promptfoo@latest view
   ```

## What's Being Compared

### HTTP Provider Configuration
- **Endpoint**: `https://api.openai.com/v1/responses`
- **Model**: `gpt-5-mini`
- **Streaming**: Enabled (`stream: true`) - demonstrates streaming configuration
- **Transform**: `json.choices[0].delta.content` - attempts to parse streaming chunks
- **Environment**: Uses `{{env.OPENAI_API_KEY}}` templating

### Built-in OpenAI Provider (Recommended)
- **Provider**: `openai:responses:gpt-5-mini`
- **Benefits**:
  - ✅ Simpler configuration
  - ✅ Automatic environment variable handling
  - ✅ Better error handling
  - ✅ Optimized performance

## Expected Results

You'll see a **50% pass rate** demonstrating the streaming issues:

**HTTP Provider (6 errors)**: Fails with "Cannot read properties of null (reading 'choices')" because the Responses API uses a completely different streaming format than Chat Completions. The raw output shows Server-Sent Events like:
```
event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"Mount"...
```
The `transformResponse` expects `json.choices[0].delta.content` but Responses API streams individual `delta` events without the `choices` structure.

**Built-in OpenAI Provider (6 successes)**: Works perfectly, generating complete responses like haikus and explanations.

This demonstrates:
- **API format complexity**: Different OpenAI APIs (Chat Completions vs Responses) have different streaming formats
- **HTTP provider limitations**: Cannot easily adapt to various streaming response structures
- **Built-in provider reliability**: Handles different API formats and streaming automatically
- **No streaming advantage**: Same total duration whether streaming or not during evaluation

## Why Streaming Doesn't Help

During evaluation, promptfoo:
1. **Waits for completion**: Each test waits for the full response before proceeding
2. **No progressive display**: Results are shown after completion, not during generation
3. **No latency improvement**: Total time is the same whether streaming or not

Streaming is only beneficial for:
- Interactive applications that display responses progressively
- Real-time user interfaces
- Applications that process partial responses

## Configuration Details

```yaml
# HTTP provider (more complex, no streaming benefit)
- id: https://api.openai.com/v1/responses
  config:
    headers:
      Authorization: 'Bearer {{env.OPENAI_API_KEY}}'
    body:
      model: 'gpt-5-mini'
      stream: true  # Demonstrates streaming (but no benefit during eval)
    transformResponse: 'json.choices[0].delta.content'

# Built-in provider (recommended)
- openai:responses:gpt-5-mini
```

## When to Use HTTP Provider

Only use the HTTP provider for OpenAI if you need:
- Custom request/response transformations
- Specific debugging or logging requirements
- Integration with custom middleware or proxies
- Testing custom API endpoints that mimic OpenAI's format

For standard OpenAI usage, always prefer the built-in provider.

## Next Steps

- Compare the results to see both approaches work identically
- Try the built-in OpenAI provider (`openai:responses:gpt-5-mini`) in your actual projects
- See [OpenAI provider documentation](https://promptfoo.dev/docs/providers/openai) for advanced features

For more HTTP provider configuration options, see the [documentation](https://promptfoo.dev/docs/providers/http).