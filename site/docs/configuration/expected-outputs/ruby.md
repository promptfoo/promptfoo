---
sidebar_position: 52
sidebar_label: Ruby
description: Create advanced Ruby validation scripts with complex logic, external APIs, and custom libraries for sophisticated output grading
---

# Ruby assertions

The `ruby` assertion allows you to provide a custom Ruby function to validate the LLM output.

A variable named `output` is injected into the context. The function should return `true` if the output passes the assertion, and `false` otherwise. If the function returns a number, it will be treated as a score.

Example:

```yaml
assert:
  - type: ruby
    value: output[5..9] == 'Hello'
```

You may also return a number, which will be treated as a score:

```yaml
assert:
  - type: ruby
    value: Math.log10(output.length) * 10
```

## Multiline functions

Ruby assertions support multiline strings:

```yaml
assert:
  - type: ruby
    value: |
      # Insert your scoring logic here...
      if output == 'Expected output'
        return {
          'pass' => true,
          'score' => 0.5,
        }
      end
      return {
        'pass' => false,
        'score' => 0,
      }
```

## Using test context

A `context` object is available in the Ruby function. Here is its type definition:

```ruby
# TraceSpan
{
  'spanId' => String,
  'parentSpanId' => String | nil,
  'name' => String,
  'startTime' => Integer,  # Unix timestamp in milliseconds
  'endTime' => Integer | nil,  # Unix timestamp in milliseconds
  'attributes' => Hash | nil,
  'statusCode' => Integer | nil,
  'statusMessage' => String | nil
}

# TraceData
{
  'traceId' => String,
  'spans' => Array[TraceSpan]
}

# AssertionValueFunctionContext
{
  # Raw prompt sent to LLM
  'prompt' => String | nil,

  # Test case variables
  'vars' => Hash[String, String | Object],

  # The complete test case
  'test' => Hash,  # Contains keys like "vars", "assert", "options"

  # Log probabilities from the LLM response, if available
  'logProbs' => Array[Float] | nil,

  # Configuration passed to the assertion
  'config' => Hash | nil,

  # The provider that generated the response
  'provider' => Object | nil,  # ApiProvider type

  # The complete provider response
  'providerResponse' => Object | nil,  # ProviderResponse type

  # OpenTelemetry trace data (when tracing is enabled)
  'trace' => TraceData | nil
}
```

For example, if the test case has a var `example`, access it in Ruby like this:

```yaml
tests:
  - description: 'Test with context'
    vars:
      example: 'Example text'
    assert:
      - type: ruby
        value: 'context["vars"]["example"] in output'
```

## External .rb

To reference an external file, use the `file://` prefix:

```yaml
assert:
  - type: ruby
    value: file://relative/path/to/script.rb
    config:
      outputLengthLimit: 10
```

You can specify a particular function to use by appending it after a colon:

```yaml
assert:
  - type: ruby
    value: file://relative/path/to/script.rb:custom_assert
```

If no function is specified, it defaults to `get_assert`.

This file will be called with an `output` string and an `AssertionValueFunctionContext` object (see above).
It expects that either a `bool` (pass/fail), `float` (score), or `GradingResult` will be returned.

Here's an example `assert.rb`:

```ruby
require 'json'

# Default function name
def get_assert(output, context)
  puts 'Prompt:', context['prompt']
  puts 'Vars', context['vars']['topic']

  # This return is an example GradingResult hash
  {
    'pass' => true,
    'score' => 0.6,
    'reason' => 'Looks good to me',
  }
end

# Custom function name
def custom_assert(output, context)
  output.length > 10
end
```

This is an example of an assertion that uses data from a configuration defined in the assertion's YML file:

```ruby
def get_assert(output, context)
  output.length <= context.fetch('config', {}).fetch('outputLengthLimit', 0)
end
```

You can also return nested metrics and assertions via a `GradingResult` object:

```ruby
{
  'pass' => true,
  'score' => 0.75,
  'reason' => 'Looks good to me',
  'componentResults' => [{
    'pass' => output.downcase.include?('bananas'),
    'score' => 0.5,
    'reason' => 'Contains banana',
  }, {
    'pass' => output.downcase.include?('yellow'),
    'score' => 0.5,
    'reason' => 'Contains yellow',
  }]
}
```

### GradingResult types

Here's a Ruby type definition you can use for the [`GradingResult`](/docs/configuration/reference/#gradingresult) object:

```ruby
# GradingResult
{
  'pass' => Boolean,  # Can also use 'pass_' if 'pass' conflicts with Ruby keywords
  'score' => Float,
  'reason' => String,
  'componentResults' => Array[GradingResult] | nil,  # Component results (optional)
  'namedScores' => Hash[String, Float] | nil  # Appear as metrics in the UI (optional)
}
```

:::tip Snake case support
Ruby snake_case fields are automatically mapped to camelCase:

- `pass_` → `pass` (or just use `"pass"` as a hash key)
- `named_scores` → `namedScores`
- `component_results` → `componentResults`
- `tokens_used` → `tokensUsed`
  :::

## Using trace data

When [tracing is enabled](/docs/tracing/), OpenTelemetry trace data is available in the `context['trace']` object. This allows you to write assertions based on the execution flow:

```ruby
def get_assert(output, context)
  # Check if trace data is available
  unless context['trace']
    # Tracing not enabled, skip trace-based checks
    return true
  end

  # Access trace spans
  spans = context['trace']['spans']

  # Example: Check for errors in any span
  error_spans = spans.select { |s| s.fetch('statusCode', 0) >= 400 }
  if error_spans.any?
    return {
      'pass' => false,
      'score' => 0,
      'reason' => "Found #{error_spans.length} error spans"
    }
  end

  # Example: Calculate total trace duration
  if spans.any?
    duration = spans.map { |s| s.fetch('endTime', 0) }.max - spans.map { |s| s['startTime'] }.min
    if duration > 5000  # 5 seconds
      return {
        'pass' => false,
        'score' => 0,
        'reason' => "Trace took too long: #{duration}ms"
      }
    end
  end

  # Example: Check for specific operations
  api_calls = spans.select { |s| s['name'].downcase.include?('http') }
  if api_calls.length > 10
    return {
      'pass' => false,
      'score' => 0,
      'reason' => "Too many API calls: #{api_calls.length}"
    }
  end

  true
end
```

Example YAML configuration:

```yaml
tests:
  - vars:
      query: "What's the weather?"
    assert:
      - type: ruby
        value: |
          # Ensure retrieval happened before response generation
          if context['trace']
            spans = context['trace']['spans']
            retrieval_span = spans.find { |s| s['name'].include?('retrieval') }
            generation_span = spans.find { |s| s['name'].include?('generation') }

            if retrieval_span && generation_span
              return retrieval_span['startTime'] < generation_span['startTime']
            end
          end
          true
```

## Overriding the Ruby binary

By default, promptfoo will run `ruby` in your shell. Make sure `ruby` points to the appropriate executable.

If a `ruby` binary is not present, you will see a "ruby: command not found" error.

To override the Ruby binary, set the `PROMPTFOO_RUBY` environment variable. You may set it to a path (such as `/path/to/ruby`) or just an executable in your PATH (such as `ruby`).

## Other assertion types

For more info on assertions, see [Test assertions](/docs/configuration/expected-outputs).
