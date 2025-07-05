---
sidebar_label: Mistral AI
title: Mistral AI Provider - Complete Guide to Models, Reasoning, and API Integration
description: Comprehensive guide to using Mistral AI models in promptfoo, including Magistral reasoning models, multimodal capabilities, function calling, and cost-effective API integration.
keywords:
  [
    mistral ai,
    magistral reasoning,
    openai alternative,
    llm evaluation,
    function calling,
    multimodal ai,
    code generation,
    mistral api,
  ]
---

# Mistral AI

The [Mistral AI API](https://docs.mistral.ai/api/) provides access to cutting-edge language models that deliver exceptional performance at competitive pricing. Mistral offers a compelling alternative to OpenAI and other providers, with specialized models for reasoning, code generation, and multimodal tasks.

Mistral is particularly valuable for:

- **Cost-effective AI integration** with pricing up to 8x lower than competitors
- **Advanced reasoning** with Magistral models that show step-by-step thinking
- **Code generation excellence** with Codestral models supporting 80+ programming languages
- **Multimodal capabilities** for text and image processing
- **Enterprise deployments** with on-premises options requiring just 4 GPUs
- **Multilingual applications** with native support for 12+ languages

:::tip Why Choose Mistral?

Mistral Medium 3 offers GPT-4 class performance at $0.40/$2.00 per million tokens (input/output), representing significant cost savings compared to OpenAI's $2.50/$10.00 pricing for similar capabilities.

:::

## API Key

To use Mistral AI, you need to set the `MISTRAL_API_KEY` environment variable, or specify the `apiKey` in the provider configuration.

Example of setting the environment variable:

```sh
export MISTRAL_API_KEY=your_api_key_here
```

## Configuration Options

The Mistral provider supports extensive configuration options:

### Basic Options

```yaml
providers:
  - id: mistral:mistral-large-latest
    config:
      # Model behavior
      temperature: 0.7 # Creativity (0.0-2.0)
      top_p: 0.95 # Nucleus sampling (0.0-1.0)
      max_tokens: 4000 # Response length limit

      # Advanced options
      safe_prompt: true # Content filtering
      random_seed: 42 # Deterministic outputs
      frequency_penalty: 0.1 # Reduce repetition
      presence_penalty: 0.1 # Encourage diversity
```

### JSON Mode

Force structured JSON output:

```yaml
providers:
  - id: mistral:mistral-large-latest
    config:
      response_format:
        type: 'json_object'
      temperature: 0.3 # Lower temp for consistent JSON

tests:
  - vars:
      prompt: "Extract name, age, and occupation from: 'John Smith, 35, engineer'. Return as JSON."
    assert:
      - type: is-json
      - type: javascript
        value: JSON.parse(output).name === "John Smith"
```

### Authentication Configuration

```yaml
providers:
  # Option 1: Environment variable (recommended)
  - id: mistral:mistral-large-latest

  # Option 2: Direct API key (not recommended for production)
  - id: mistral:mistral-large-latest
    config:
      apiKey: 'your-api-key-here'

  # Option 3: Custom environment variable
  - id: mistral:mistral-large-latest
    config:
      apiKeyEnvar: 'CUSTOM_MISTRAL_KEY'

  # Option 4: Custom endpoint
  - id: mistral:mistral-large-latest
    config:
      apiHost: 'custom-proxy.example.com'
      apiBaseUrl: 'https://custom-api.example.com/v1'
```

### Advanced Model Configuration

````yaml
providers:
  # Reasoning model with optimal settings
  - id: mistral:magistral-medium-latest
    config:
      temperature: 0.7
      top_p: 0.95
      max_tokens: 40960 # Full context for reasoning

  # Code generation with FIM support
  - id: mistral:codestral-latest
    config:
      temperature: 0.2 # Low for consistent code
      max_tokens: 8000
      stop: ['```'] # Stop at code block end

  # Multimodal configuration
  - id: mistral:pixtral-12b
    config:
      temperature: 0.5
      max_tokens: 2000
      # Image processing options handled automatically
````

### Environment Variables Reference

| Variable               | Description                     | Example                      |
| ---------------------- | ------------------------------- | ---------------------------- |
| `MISTRAL_API_KEY`      | Your Mistral API key (required) | `sk-1234...`                 |
| `MISTRAL_API_HOST`     | Custom hostname for proxy setup | `api.example.com`            |
| `MISTRAL_API_BASE_URL` | Full base URL override          | `https://api.example.com/v1` |

## Model Selection

You can specify which Mistral model to use in your configuration. The following models are available:

### Chat Models

#### Premier Models

| Model                     | Context | Input Price | Output Price | Best For                                  |
| ------------------------- | ------- | ----------- | ------------ | ----------------------------------------- |
| `mistral-large-latest`    | 128k    | $2.00/1M    | $6.00/1M     | Complex reasoning, enterprise tasks       |
| `mistral-medium-latest`   | 128k    | $0.40/1M    | $2.00/1M     | Balanced performance and cost             |
| `codestral-latest`        | 256k    | $0.30/1M    | $0.90/1M     | Code generation, 80+ languages            |
| `magistral-medium-latest` | 40k     | $2.00/1M    | $5.00/1M     | Advanced reasoning, step-by-step thinking |

#### Free Models

| Model                    | Context | Input Price | Output Price | Best For                      |
| ------------------------ | ------- | ----------- | ------------ | ----------------------------- |
| `mistral-small-latest`   | 128k    | $0.10/1M    | $0.30/1M     | General tasks, cost-effective |
| `magistral-small-latest` | 40k     | $0.50/1M    | $1.50/1M     | Reasoning on a budget         |
| `open-mistral-nemo`      | 128k    | $0.15/1M    | $0.15/1M     | Multilingual, research        |
| `pixtral-12b`            | 128k    | $0.15/1M    | $0.15/1M     | Vision + text, multimodal     |

#### Legacy Models (Deprecated)

1. `open-mistral-7b`, `mistral-tiny`, `mistral-tiny-2312`
2. `open-mistral-nemo`, `open-mistral-nemo-2407`, `mistral-tiny-2407`, `mistral-tiny-latest`
3. `mistral-small-2402`
4. `mistral-medium-2312`, `mistral-medium`
5. `mistral-large-2402`
6. `mistral-large-2407`
7. `codestral-2405`
8. `codestral-mamba-2407`, `open-codestral-mamba`, `codestral-mamba-latest`
9. `open-mixtral-8x7b`, `mistral-small`, `mistral-small-2312`
10. `open-mixtral-8x22b`, `open-mixtral-8x22b-2404`

### Embedding Model

- `mistral-embed` - $0.10/1M tokens - 8k context

Here's an example config that compares different Mistral models:

```yaml
providers:
  - mistral:mistral-medium-latest
  - mistral:mistral-small-latest
  - mistral:open-mistral-nemo
  - mistral:magistral-medium-latest
  - mistral:magistral-small-latest
```

## Reasoning Models

Mistral's **Magistral** models are specialized reasoning models announced in June 2025. These models excel at multi-step logic, transparent reasoning, and complex problem-solving across multiple languages.

### Key Features of Magistral Models

- **Chain-of-thought reasoning**: Models provide step-by-step reasoning traces before arriving at final answers
- **Multilingual reasoning**: Native reasoning capabilities across English, French, Spanish, German, Italian, Arabic, Russian, Chinese, and more
- **Transparency**: Traceable thought processes that can be followed and verified
- **Domain expertise**: Optimized for structured calculations, programmatic logic, decision trees, and rule-based systems

### Magistral Model Variants

- **Magistral Small** (`magistral-small-2506`): 24B parameter open-source version under Apache 2.0 license
- **Magistral Medium** (`magistral-medium-2506`): More powerful enterprise version with enhanced reasoning capabilities

### Usage Recommendations

For reasoning tasks, consider using these parameters for optimal performance:

```yaml
providers:
  - id: mistral:magistral-medium-latest
    config:
      temperature: 0.7
      top_p: 0.95
      max_tokens: 40960 # Recommended for reasoning tasks
```

## Multimodal Capabilities

Mistral offers vision-capable models that can process both text and images:

### Image Understanding

Use `pixtral-12b` for multimodal tasks:

```yaml
providers:
  - id: mistral:pixtral-12b
    config:
      temperature: 0.7
      max_tokens: 1000

tests:
  - vars:
      prompt: 'What do you see in this image?'
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...'
```

### Supported Image Formats

- **JPEG, PNG, GIF, WebP**
- **Maximum size**: 20MB per image
- **Resolution**: Up to 2048x2048 pixels optimal

## Function Calling & Tool Use

Mistral models support advanced function calling for building AI agents and tools:

```yaml
providers:
  - id: mistral:mistral-large-latest
    config:
      temperature: 0.1
      tools:
        - type: function
          function:
            name: get_weather
            description: Get current weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: City name
                unit:
                  type: string
                  enum: ['celsius', 'fahrenheit']
              required: ['location']

tests:
  - vars:
      prompt: "What's the weather like in Paris?"
    assert:
      - type: contains
        value: 'get_weather'
```

### Tool Calling Best Practices

- Use **low temperature** (0.1-0.3) for consistent tool calls
- Provide **detailed function descriptions**
- Include **parameter validation** in your tools
- Handle **tool call errors** gracefully

## Code Generation

Mistral's Codestral models excel at code generation across 80+ programming languages:

### Fill-in-the-Middle (FIM)

```yaml
providers:
  - id: mistral:codestral-latest
    config:
      temperature: 0.2
      max_tokens: 2000

tests:
  - vars:
      prompt: |
        <fim_prefix>def calculate_fibonacci(n):
            if n <= 1:
                return n
        <fim_suffix>

        # Test the function
        print(calculate_fibonacci(10))
        <fim_middle>
    assert:
      - type: contains
        value: 'fibonacci'
```

### Code Generation Examples

```yaml
tests:
  - description: 'Python API endpoint'
    vars:
      prompt: 'Create a FastAPI endpoint that accepts a POST request with user data and saves it to a database'
    assert:
      - type: contains
        value: '@app.post'
      - type: contains
        value: 'async def'

  - description: 'React component'
    vars:
      prompt: 'Create a React component for a user profile card with name, email, and avatar'
    assert:
      - type: contains
        value: 'export'
      - type: contains
        value: 'useState'
```

## Complete Working Examples

### Example 1: Multi-Model Comparison

```yaml
description: 'Compare reasoning capabilities across Mistral models'

providers:
  - mistral:magistral-medium-latest
  - mistral:magistral-small-latest
  - mistral:mistral-large-latest
  - mistral:mistral-small-latest

prompts:
  - 'Solve this step by step: {{problem}}'

tests:
  - vars:
      problem: "A company has 100 employees. 60% work remotely, 25% work hybrid, and the rest work in office. If remote workers get a $200 stipend and hybrid workers get $100, what's the total monthly stipend cost?"
    assert:
      - type: llm-rubric
        value: 'Shows clear mathematical reasoning and arrives at correct answer ($13,500)'
      - type: cost
        threshold: 0.10
```

### Example 2: Code Review Assistant

````yaml
description: 'AI-powered code review using Codestral'

providers:
  - id: mistral:codestral-latest
    config:
      temperature: 0.3
      max_tokens: 1500

prompts:
  - |
    Review this code for bugs, security issues, and improvements:

    ```{{language}}
    {{code}}
    ```

    Provide specific feedback on:
    1. Potential bugs
    2. Security vulnerabilities  
    3. Performance improvements
    4. Code style and best practices

tests:
  - vars:
      language: 'python'
      code: |
        import subprocess

        def run_command(user_input):
            result = subprocess.run(user_input, shell=True, capture_output=True)
            return result.stdout.decode()
    assert:
      - type: contains
        value: 'security'
      - type: llm-rubric
        value: 'Identifies shell injection vulnerability and suggests safer alternatives'
````

### Example 3: Multimodal Document Analysis

```yaml
description: 'Analyze documents with text and images'

providers:
  - id: mistral:pixtral-12b
    config:
      temperature: 0.5
      max_tokens: 2000

tests:
  - vars:
      prompt: |
        Analyze this document image and:
        1. Extract key information
        2. Summarize main points
        3. Identify any data or charts
      image_url: 'https://example.com/financial-report.png'
    assert:
      - type: llm-rubric
        value: 'Accurately extracts text and data from the document image'
      - type: length
        min: 200
```

## Authentication & Setup

### Environment Variables

```bash
# Required
export MISTRAL_API_KEY="your-api-key-here"

# Optional - for custom endpoints
export MISTRAL_API_BASE_URL="https://api.mistral.ai/v1"
export MISTRAL_API_HOST="api.mistral.ai"
```

### Getting Your API Key

1. Visit [console.mistral.ai](https://console.mistral.ai)
2. Sign up or log in to your account
3. Navigate to **API Keys** section
4. Click **Create new key**
5. Copy and securely store your key

:::warning Security Best Practices

- Never commit API keys to version control
- Use environment variables or secure vaults
- Rotate keys regularly
- Monitor usage for unexpected spikes

:::

## Performance Optimization

### Model Selection Guide

| Use Case                   | Recommended Model         | Why                          |
| -------------------------- | ------------------------- | ---------------------------- |
| **Cost-sensitive apps**    | `mistral-small-latest`    | Best price/performance ratio |
| **Complex reasoning**      | `magistral-medium-latest` | Step-by-step thinking        |
| **Code generation**        | `codestral-latest`        | Specialized for programming  |
| **Vision tasks**           | `pixtral-12b`             | Multimodal capabilities      |
| **High-volume production** | `mistral-medium-latest`   | Balanced cost and quality    |

### Context Window Optimization

```yaml
providers:
  - id: mistral:magistral-medium-latest
    config:
      max_tokens: 8000 # Leave room for 32k input context
      temperature: 0.7
```

### Cost Management

```yaml
# Monitor costs across models
defaultTest:
  assert:
    - type: cost
      threshold: 0.05 # Alert if cost > $0.05 per test

providers:
  - id: mistral:mistral-small-latest # Most cost-effective
    config:
      max_tokens: 500 # Limit output length
```

## Troubleshooting

### Common Issues

#### Authentication Errors

```
Error: 401 Unauthorized
```

**Solution**: Verify your API key is correctly set:

```bash
echo $MISTRAL_API_KEY
# Should output your key, not empty
```

#### Rate Limiting

```
Error: 429 Too Many Requests
```

**Solutions**:

- Implement exponential backoff
- Use smaller batch sizes
- Consider upgrading your plan

```yaml
# Reduce concurrent requests
providers:
  - id: mistral:mistral-large-latest
    config:
      timeout: 30000 # Increase timeout
```

#### Context Length Exceeded

```
Error: Context length exceeded
```

**Solutions**:

- Truncate input text
- Use models with larger context windows
- Implement text summarization for long inputs

```yaml
providers:
  - id: mistral:mistral-medium-latest # 128k context
    config:
      max_tokens: 4000 # Leave room for input
```

#### Model Availability

```
Error: Model not found
```

**Solution**: Check model names and use latest versions:

```yaml
providers:
  - mistral:mistral-large-latest # ✅ Use latest
  # - mistral:mistral-large-2402  # ❌ Deprecated
```

### Debugging Tips

1. **Enable debug logging**:

   ```bash
   export DEBUG=promptfoo:*
   ```

2. **Test with simple prompts first**:

   ```yaml
   tests:
     - vars:
         prompt: 'Hello, world!'
   ```

3. **Check token usage**:
   ```yaml
   tests:
     - assert:
         - type: cost
           threshold: 0.01
   ```

### Getting Help

- **Documentation**: [docs.mistral.ai](https://docs.mistral.ai)
- **Community**: [Discord](https://discord.gg/mistralai)
- **Support**: [support@mistral.ai](mailto:support@mistral.ai)
- **Status**: [status.mistral.ai](https://status.mistral.ai)

## Working Examples

Ready-to-use examples are available in our GitHub repository:

### 📋 [Complete Mistral Example Collection](https://github.com/promptfoo/promptfoo/tree/main/examples/mistral)

Run any of these examples locally:

```bash
npx promptfoo@latest init --example mistral
```

**Individual Examples:**

- **[AIME2024 Mathematical Reasoning](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.aime2024.yaml)** - Evaluate Magistral models on advanced mathematical competition problems
- **[Model Comparison](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.comparison.yaml)** - Compare reasoning across Magistral and traditional models
- **[Function Calling](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.tool-use.yaml)** - Demonstrate tool use and function calling
- **[JSON Mode](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.json-mode.yaml)** - Structured output generation
- **[Code Generation](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.code-generation.yaml)** - Multi-language code generation with Codestral
- **[Reasoning Tasks](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.reasoning.yaml)** - Advanced step-by-step problem solving
- **[Multimodal](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.multimodal.yaml)** - Vision capabilities with Pixtral

### Quick Start

```bash
# Try the basic comparison
npx promptfoo@latest eval -c https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/mistral/promptfooconfig.comparison.yaml

# Test mathematical reasoning with Magistral models
npx promptfoo@latest eval -c https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/mistral/promptfooconfig.aime2024.yaml

# Test reasoning capabilities
npx promptfoo@latest eval -c https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/mistral/promptfooconfig.reasoning.yaml
```

:::tip Contribute Examples

Found a great use case? [Contribute your example](https://github.com/promptfoo/promptfoo/tree/main/examples) to help the community!

:::
