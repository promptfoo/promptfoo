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

The `context` variable contains the prompt and test case variables:

```ts
interface AssertContext {
  // Raw prompt sent to LLM
  prompt: string;

  // Test case variables
  vars: Record<string, string | object>;
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
```

The Javascript file must export an assertion function. Here's an example:

```js
module.exports = (output, context) => {
  return output.length > 10;
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

### ES modules

ES modules are supported, but must have a `.mjs` file extension. Alternatively, if you are transpiling Javascript or Typescript, we recommend pointing promptfoo to the transpiled plain Javascript output.

## Other assertion types

For more info on assertions, see [Test assertions](/docs/configuration/expected-outputs).
