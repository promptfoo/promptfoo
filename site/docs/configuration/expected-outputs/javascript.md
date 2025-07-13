---
sidebar_position: 50
sidebar_label: Javascript
---

# Javascript assertions

The `javascript` [assertion](/docs/configuration/expected-outputs) allows you to provide a custom JavaScript function to validate the LLM output.

A variable named `output` is injected into the context. The function should return `true` if the output passes the assertion, and `false` otherwise. If the function returns a number, it will be treated as a score.

You can use any valid JavaScript code in your function. The output of the LLM is provided as the `output` variable:

```yaml
assert:
  - type: javascript
    value: "output.includes('Hello, World!')"
```

In the example above, the `javascript` assertion checks if the output includes the string "Hello, World!". If it does, the assertion passes and a score of 1 is recorded. If it doesn't, the assertion fails and a score of 0 is returned.

If you want to return a custom score, your function should return a number. For example:

```yaml
assert:
  - type: javascript
    value: Math.log(output.length) * 10
    threshold: 0.5 # any value above 0.5 will pass
```

In the example above, the longer the output, the higher the score.

If your function throws an error, the assertion will fail and the error message will be included in the reason for the failure. For example:

```yaml
assert:
  - type: javascript
    value: |
      if (errorCase) {
        throw new Error('This is an error');
      }
      return {
        pass: false,
        score: 0,
        reason: 'Assertion failed',
      };
```

## Handling objects

If the LLM outputs a JSON object (such as in the case of tool/function calls), then `output` will already be parsed as an object:

```yaml
assert:
  - type: javascript
    value: output[0].function.name === 'get_current_weather'
```

## Return type

The return value of your Javascript function can be a boolean, number, or a `GradingResult`:

```typescript
type JavascriptAssertionResult = boolean | number | GradingResult;

// Used for more complex results
interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: GradingResult[];
}
```

If `componentResults` is set, a table of assertion details will be shown in the test output modal in the Eval view.

## Multiline functions

Javascript assertions support multiline strings:

```yaml
assert:
  - type: javascript
    value: |
      // Insert your scoring logic here...
      if (output === 'Expected output') {
        return {
          pass: true,
          score: 0.5,
        };
      }
      return {
        pass: false,
        score: 0,
        reason: 'Assertion failed',
      };
```

## Using test context

The `context` variable contains information about the test case and execution environment:

```ts
interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number; // Unix timestamp in milliseconds
  endTime?: number; // Unix timestamp in milliseconds
  attributes?: Record<string, any>;
  statusCode?: number;
  statusMessage?: string;
}

interface TraceData {
  traceId: string;
  spans: TraceSpan[];
}

interface AssertionValueFunctionContext {
  // Raw prompt sent to LLM
  prompt: string | undefined;

  // Test case variables
  vars: Record<string, string | object>;

  // The complete test case
  test: AtomicTestCase;

  // Log probabilities from the LLM response, if available
  logProbs: number[] | undefined;

  // Configuration passed to the assertion
  config?: Record<string, any>;

  // The provider that generated the response
  provider: ApiProvider | undefined;

  // The complete provider response
  providerResponse: ProviderResponse | undefined;

  // OpenTelemetry trace data (when tracing is enabled)
  trace?: TraceData;
}
```

For example, if the test case has a var `example`, access it in your JavaScript function like this:

```yaml
tests:
  - description: 'Test with context'
    vars:
      example: 'Example text'
    assert:
      - type: javascript
        value: 'output.includes(context.vars.example)'
```

You can also use the `context` variable to perform more complex checks. For example, you could check if the output is longer than a certain length defined in your test case variables:

```yaml
tests:
  - description: 'Test with context'
    vars:
      min_length: 10
    assert:
      - type: javascript
        value: 'output.length >= context.vars.min_length'
```

## External script

To reference an external file, use the `file://` prefix:

```yaml
assert:
  - type: javascript
    value: file://relative/path/to/script.js
    config:
      maximumOutputSize: 10
```

You can specify a particular function to use by appending it after a colon:

```yaml
assert:
  - type: javascript
    value: file://relative/path/to/script.js:customFunction
```

The JavaScript file must export an assertion function. Here are examples:

```js
// Default export
module.exports = (output, context) => {
  return output.length > 10;
};
```

```js
// Named exports
module.exports.customFunction = (output, context) => {
  return output.includes('specific text');
};
```

Here's an example using configuration data defined in the assertion's YAML file:

```js
module.exports = (output, context) => {
  return output.length <= context.config.maximumOutputSize;
};
```

Here's a more complex example that uses an async function to hit an external validation service:

```js
const VALIDATION_ENDPOINT = 'https://example.com/api/validate';

async function evaluate(modelResponse) {
  try {
    const response = await fetch(VALIDATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: modelResponse,
    });

    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

async function main(output, context) {
  const success = await evaluate(output);
  console.log(`success: ${testResult}`);
  return success;
}

module.exports = main;
```

You can also return complete [`GradingResult`](/docs/configuration/reference/#gradingresult) objects. For example:

```js
module.exports = (output, context) => {
  console.log('Prompt:', context.prompt);
  console.log('Vars', context.vars.topic);

  // You can return a bool...
  // return output.toLowerCase().includes('bananas');

  // A score (where 0 = Fail)...
  // return 0.5;

  // Or an entire grading result, which can be simple...
  let result = {
    pass: output.toLowerCase().includes('bananas'),
    score: 0.5,
    reason: 'Contains banana',
  };

  // Or include nested assertions...
  result = {
    pass: true,
    score: 0.75,
    reason: 'Looks good to me',
    componentResults: [
      {
        pass: output.toLowerCase().includes('bananas'),
        score: 0.5,
        reason: 'Contains banana',
        namedScores: {
          'Uses banana': 1.0,
        },
      },
      {
        pass: output.toLowerCase().includes('yellow'),
        score: 0.5,
        reason: 'Contains yellow',
        namedScores: {
          Yellowish: 0.66,
        },
      },
    ],
  };

  return result;
};
```

## Inline assertions

If you are using promptfoo as a JS package, you can build your assertion inline:

```js
{
  type:"javascript",
  value: (output, context) => {
    return output.includes("specific text");
  }
}
```

Output will always be a string, so if your [custom response parser](/docs/providers/http/#function-parser) returned an object, you can use `JSON.parse(output)` to convert it back to an object.

## Using trace data

When [tracing is enabled](/docs/tracing/), OpenTelemetry trace data is available in the `context.trace` object. This allows you to write assertions based on the execution flow:

```js
module.exports = (output, context) => {
  // Check if trace data is available
  if (!context.trace) {
    // Tracing not enabled, skip trace-based checks
    return true;
  }

  const { spans } = context.trace;

  // Example: Check for errors in any span
  const errorSpans = spans.filter((s) => s.statusCode >= 400);
  if (errorSpans.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: `Found ${errorSpans.length} error spans`,
    };
  }

  // Example: Calculate total trace duration
  if (spans.length > 0) {
    const duration =
      Math.max(...spans.map((s) => s.endTime || 0)) - Math.min(...spans.map((s) => s.startTime));
    if (duration > 5000) {
      // 5 seconds
      return {
        pass: false,
        score: 0,
        reason: `Trace took too long: ${duration}ms`,
      };
    }
  }

  // Example: Check for specific operations
  const apiCalls = spans.filter((s) => s.name.toLowerCase().includes('http'));
  if (apiCalls.length > 10) {
    return {
      pass: false,
      score: 0,
      reason: `Too many API calls: ${apiCalls.length}`,
    };
  }

  return true;
};
```

Example YAML configuration:

```yaml
tests:
  - vars:
      query: "What's the weather?"
    assert:
      - type: javascript
        value: |
          // Ensure retrieval happened before response generation
          if (context.trace) {
            const retrievalSpan = context.trace.spans.find(s => s.name.includes('retrieval'));
            const generationSpan = context.trace.spans.find(s => s.name.includes('generation'));
            
            if (retrievalSpan && generationSpan) {
              return retrievalSpan.startTime < generationSpan.startTime;
            }
          }
          return true;
```

Additional examples:

```js
// Check span hierarchy depth
const MAX_ALLOWED_DEPTH = 1000;
const maxDepth = (spans, parentId = null, depth = 0) => {
  if (depth > MAX_ALLOWED_DEPTH) {
    throw new Error('Span hierarchy too deep');
  }
  const children = spans.filter((s) => s.parentSpanId === parentId);
  if (children.length === 0) return depth;
  return Math.max(...children.map((c) => maxDepth(spans, c.spanId, depth + 1)));
};

if (context.trace && maxDepth(context.trace.spans) > 5) {
  return {
    pass: false,
    score: 0,
    reason: 'Call stack too deep',
  };
}
```

### ES modules

ES modules are supported, but must have a `.mjs` file extension. Alternatively, if you are transpiling Javascript or Typescript, we recommend pointing promptfoo to the transpiled plain Javascript output.

## Other assertion types

For more info on assertions, see [Test assertions](/docs/configuration/expected-outputs).
