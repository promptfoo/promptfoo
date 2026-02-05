---
sidebar_label: Custom Ruby
description: 'Create custom Ruby scripts for advanced model integrations, evaluations, and complex testing logic with full flexibility'
---

# Ruby Provider

The Ruby provider enables you to create custom evaluation logic using Ruby scripts. This allows you to integrate Promptfoo with any Ruby-based model, API, or custom logic.

**Common use cases:**

- Integrating proprietary or local models
- Adding custom preprocessing/postprocessing logic
- Implementing complex evaluation workflows
- Using Ruby-specific ML libraries
- Creating mock providers for testing

## Prerequisites

Before using the Ruby provider, ensure you have:

- Ruby 2.7 or higher installed
- Basic familiarity with Promptfoo configuration
- Understanding of Ruby hashes and JSON

## Quick Start

Let's create a simple Ruby provider that echoes back the input with a prefix.

### Step 1: Create your Ruby script

```ruby
# echo_provider.rb
def call_api(prompt, options, context)
  # Simple provider that echoes the prompt with a prefix
  config = options['config'] || {}
  prefix = config['prefix'] || 'Tell me about: '

  {
    'output' => "#{prefix}#{prompt}"
  }
end
```

### Step 2: Configure Promptfoo

```yaml
# promptfooconfig.yaml
providers:
  - id: 'file://echo_provider.rb'

prompts:
  - 'Tell me a joke'
  - 'What is 2+2?'
```

### Step 3: Run the evaluation

```bash
npx promptfoo@latest eval
```

That's it! You've created your first custom Ruby provider.

## How It Works

When Promptfoo evaluates a test case with a Ruby provider:

1. **Promptfoo** prepares the prompt based on your configuration
2. **Ruby Script** is called with three parameters:
   - `prompt`: The final prompt string
   - `options`: Provider configuration from your YAML
   - `context`: Variables and metadata for the current test
3. **Your Code** processes the prompt and returns a response
4. **Promptfoo** validates the response and continues evaluation

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Promptfoo   │────▶│ Your Ruby    │────▶│ Your Logic  │
│ Evaluation  │     │ Provider     │     │ (API/Model) │
└─────────────┘     └──────────────┘     └─────────────┘
      ▲                    │
      │                    ▼
      │            ┌──────────────┐
      └────────────│   Response   │
                   └──────────────┘
```

## Basic Usage

### Function Interface

Your Ruby script must implement one or more of these functions:

```ruby
def call_api(prompt, options, context)
  # Main function for text generation tasks
end

def call_embedding_api(prompt, options, context)
  # For embedding generation tasks
end

def call_classification_api(prompt, options, context)
  # For classification tasks
end
```

### Understanding Parameters

#### The `prompt` Parameter

The prompt can be either:

- A simple string: `"What is the capital of France?"`
- A JSON-encoded conversation: `'[{"role": "user", "content": "Hello"}]'`

```ruby
require 'json'

def call_api(prompt, options, context)
  # Check if prompt is a conversation
  begin
    messages = JSON.parse(prompt)
    # Handle as chat messages
    messages.each do |msg|
      puts "#{msg['role']}: #{msg['content']}"
    end
  rescue JSON::ParserError
    # Handle as simple string
    puts "Prompt: #{prompt}"
  end
end
```

#### The `options` Parameter

Contains your provider configuration and metadata:

```ruby
{
  'id' => 'file://my_provider.rb',
  'config' => {
    # Your custom configuration from promptfooconfig.yaml
    'model_name' => 'gpt-3.5-turbo',
    'temperature' => 0.7,
    'max_tokens' => 100,

    # Automatically added by promptfoo:
    'basePath' => '/absolute/path/to/config'  # Directory containing your config (promptfooconfig.yaml)
  }
}
```

#### The `context` Parameter

Provides information about the current test case:

```ruby
{
  'vars' => {
    # Variables used in this test case
    'user_input' => 'Hello world',
    'system_prompt' => 'You are a helpful assistant'
  }
}
```

### Return Format

Your function must return a hash with these fields:

```ruby
def call_api(prompt, options, context)
  # Required field
  result = {
    'output' => 'Your response here'
  }

  # Optional fields
  result['tokenUsage'] = {
    'total' => 150,
    'prompt' => 50,
    'completion' => 100
  }

  result['cost'] = 0.0025  # in dollars
  result['cached'] = false
  result['logProbs'] = [-0.5, -0.3, -0.1]

  # Error handling
  if something_went_wrong
    result['error'] = 'Description of what went wrong'
  end

  result
end
```

### Types

The types passed into the Ruby script function and the `ProviderResponse` return type are defined as follows:

```ruby
# ProviderOptions
{
  'id' => String (optional),
  'config' => Hash (optional)
}

# CallApiContextParams
{
  'vars' => Hash[String, String]
}

# TokenUsage
{
  'total' => Integer,
  'prompt' => Integer,
  'completion' => Integer
}

# ProviderResponse
{
  'output' => String or Hash (optional),
  'error' => String (optional),
  'tokenUsage' => TokenUsage (optional),
  'cost' => Float (optional),
  'cached' => Boolean (optional),
  'logProbs' => Array[Float] (optional),
  'metadata' => Hash (optional)
}

# ProviderEmbeddingResponse
{
  'embedding' => Array[Float],
  'tokenUsage' => TokenUsage (optional),
  'cached' => Boolean (optional)
}

# ProviderClassificationResponse
{
  'classification' => Hash,
  'tokenUsage' => TokenUsage (optional),
  'cached' => Boolean (optional)
}
```

:::tip

Always include the `output` field in your response, even if it's an empty string when an error occurs.

:::

## Complete Examples

### Example 1: OpenAI-Compatible Provider

```ruby
# openai_provider.rb
require 'json'
require 'net/http'
require 'uri'

def call_api(prompt, options, context)
  # Provider that calls OpenAI API
  config = options['config'] || {}

  # Parse messages if needed
  begin
    messages = JSON.parse(prompt)
  rescue JSON::ParserError
    messages = [{ 'role' => 'user', 'content' => prompt }]
  end

  # Prepare API request
  uri = URI.parse(config['base_url'] || 'https://api.openai.com/v1/chat/completions')
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true

  request = Net::HTTP::Post.new(uri.path)
  request['Content-Type'] = 'application/json'
  request['Authorization'] = "Bearer #{ENV['OPENAI_API_KEY']}"

  request.body = JSON.generate({
    model: config['model'] || 'gpt-3.5-turbo',
    messages: messages,
    temperature: config['temperature'] || 0.7,
    max_tokens: config['max_tokens'] || 150
  })

  # Make API call
  begin
    response = http.request(request)
    data = JSON.parse(response.body)

    {
      'output' => data['choices'][0]['message']['content'],
      'tokenUsage' => {
        'total' => data['usage']['total_tokens'],
        'prompt' => data['usage']['prompt_tokens'],
        'completion' => data['usage']['completion_tokens']
      }
    }
  rescue StandardError => e
    {
      'output' => '',
      'error' => e.message
    }
  end
end
```

### Example 2: Mock Provider for Testing

```ruby
# mock_provider.rb
def call_api(prompt, options, context)
  # Mock provider for testing evaluation pipelines
  config = options['config'] || {}

  # Simulate processing time
  delay = config['delay'] || 0.1
  sleep(delay)

  # Simulate different response types
  if prompt.downcase.include?('error')
    return {
      'output' => '',
      'error' => 'Simulated error for testing'
    }
  end

  # Generate mock response
  responses = config['responses'] || [
    'This is a mock response.',
    'Mock provider is working correctly.',
    'Test response generated successfully.'
  ]

  response = responses.sample
  mock_tokens = prompt.split.size + response.split.size

  {
    'output' => response,
    'tokenUsage' => {
      'total' => mock_tokens,
      'prompt' => prompt.split.size,
      'completion' => response.split.size
    },
    'cost' => mock_tokens * 0.00001
  }
end
```

### Example 3: Local Processing with Preprocessing

```ruby
# text_processor.rb
def preprocess_prompt(prompt, context)
  # Add context-specific preprocessing
  template = context['vars']['template'] || '{prompt}'
  template.gsub('{prompt}', prompt)
end

def call_api(prompt, options, context)
  # Provider with custom preprocessing
  config = options['config'] || {}

  # Preprocess
  processed_prompt = preprocess_prompt(prompt, context)

  # Simulate processing
  result = "Processed: #{processed_prompt.upcase}"

  {
    'output' => result,
    'cached' => false
  }
end
```

## Configuration

### Basic Configuration

```yaml
providers:
  - id: 'file://my_provider.rb'
    label: 'My Custom Provider' # Optional display name
    config:
      # Any configuration your provider needs
      api_key: '{{ env.CUSTOM_API_KEY }}'
      endpoint: https://api.example.com
      model_params:
        temperature: 0.7
        max_tokens: 100
```

### Using External Configuration Files

You can load configuration from external files:

```yaml
providers:
  - id: 'file://my_provider.rb'
    config:
      # Load entire config from JSON
      settings: file://config/model_settings.json

      # Load from YAML with specific function
      prompts: file://config/prompts.yaml

      # Nested file references
      models:
        primary: file://config/primary_model.json
        fallback: file://config/fallback_model.yaml
```

Supported formats:

- **JSON** (`.json`) - Parsed as objects/arrays
- **YAML** (`.yaml`, `.yml`) - Parsed as objects/arrays
- **Text** (`.txt`, `.md`) - Loaded as strings

### Environment Configuration

#### Custom Ruby Executable

You can specify a custom Ruby executable in several ways:

**Option 1: Per-provider configuration**

```yaml
providers:
  - id: 'file://my_provider.rb'
    config:
      rubyExecutable: /path/to/ruby
```

**Option 2: Global environment variable**

```bash
# Use specific Ruby version globally
export PROMPTFOO_RUBY=/usr/local/bin/ruby
npx promptfoo@latest eval
```

#### Ruby Detection Process

Promptfoo automatically detects your Ruby installation in this priority order:

1. **Environment variable**: `PROMPTFOO_RUBY` (if set)
2. **Provider config**: `rubyExecutable` in your config
3. **Windows detection**: Uses `where ruby` (Windows only)
4. **Smart detection**: Uses `ruby -e "puts RbConfig.ruby"` to find the actual Ruby path
5. **Fallback commands**:
   - Windows: `ruby`
   - macOS/Linux: `ruby`

## Advanced Features

### Custom Function Names

Override the default function name:

```yaml
providers:
  - id: 'file://my_provider.rb:generate_response'
    config:
      model: 'custom-model'
```

```ruby
# my_provider.rb
def generate_response(prompt, options, context)
  # Your custom function
  { 'output' => 'Custom response' }
end
```

### Handling Different Input Types

```ruby
require 'json'

def call_api(prompt, options, context)
  # Handle various prompt formats

  # Text prompt
  if prompt.is_a?(String)
    begin
      # Try parsing as JSON
      data = JSON.parse(prompt)
      if data.is_a?(Array)
        # Chat format
        return handle_chat(data, options)
      elsif data.is_a?(Hash)
        # Structured prompt
        return handle_structured(data, options)
      end
    rescue JSON::ParserError
      # Plain text
      return handle_text(prompt, options)
    end
  end
end
```

### Implementing Guardrails

```ruby
def call_api(prompt, options, context)
  # Provider with safety guardrails
  config = options['config'] || {}

  # Check for prohibited content
  prohibited_terms = config['prohibited_terms'] || []
  prohibited_terms.each do |term|
    if prompt.downcase.include?(term.downcase)
      return {
        'output' => 'I cannot process this request.',
        'guardrails' => {
          'flagged' => true,
          'reason' => 'Prohibited content detected'
        }
      }
    end
  end

  # Process normally
  result = generate_response(prompt)

  # Post-process checks
  if check_output_safety(result)
    { 'output' => result }
  else
    {
      'output' => '[Content filtered]',
      'guardrails' => { 'flagged' => true }
    }
  end
end
```

## Troubleshooting

### Common Issues and Solutions

| Issue                          | Solution                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| "Ruby not found" errors        | Set `PROMPTFOO_RUBY` env var or use `rubyExecutable` in config       |
| "cannot load such file" errors | Ensure required gems are installed with `gem install` or use bundler |
| Script not executing           | Check file path is relative to `promptfooconfig.yaml`                |
| No output visible              | Use `LOG_LEVEL=debug` to see print statements                        |
| JSON parsing errors            | Ensure prompt format matches your parsing logic                      |
| Timeout errors                 | Optimize initialization code, load resources once                    |

### Debugging Tips

1. **Enable debug logging:**

   ```bash
   LOG_LEVEL=debug npx promptfoo@latest eval
   ```

2. **Add logging to your provider:**

   ```ruby
   def call_api(prompt, options, context)
     $stderr.puts "Received prompt: #{prompt}"
     $stderr.puts "Config: #{options['config'].inspect}"
     # Your logic here
   end
   ```

3. **Test your provider standalone:**

   ```ruby
   # test_provider.rb
   require_relative 'my_provider'

   result = call_api(
     'Test prompt',
     { 'config' => { 'model' => 'test' } },
     { 'vars' => {} }
   )
   puts result.inspect
   ```

## Migration Guide

### From HTTP Provider

If you're currently using an HTTP provider, you can wrap your API calls:

```ruby
# http_wrapper.rb
require 'net/http'
require 'json'
require 'uri'

def call_api(prompt, options, context)
  config = options['config'] || {}
  uri = URI.parse(config['url'])

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = (uri.scheme == 'https')

  request = Net::HTTP::Post.new(uri.path)
  request['Content-Type'] = 'application/json'
  config['headers']&.each { |k, v| request[k] = v }
  request.body = JSON.generate({ 'prompt' => prompt })

  response = http.request(request)
  JSON.parse(response.body)
end
```

### From Python Provider

The Ruby provider follows the same interface as Python providers:

```python
# Python
def call_api(prompt, options, context):
    return {"output": f"Echo: {prompt}"}
```

```ruby
# Ruby equivalent
def call_api(prompt, options, context)
  { 'output' => "Echo: #{prompt}" }
end
```

## See Also

- [Custom assertions](/docs/configuration/expected-outputs/) - Define expected outputs and validation rules
- [Python Provider](/docs/providers/python) - Similar scripting provider for Python
- [Custom Script Provider](/docs/providers/custom-script) - JavaScript/TypeScript provider alternative
