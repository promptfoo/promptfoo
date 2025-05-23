# extension-api (Custom Extensions Example for promptfoo)

You can run this example with:

```bash
npx promptfoo@latest init --example extension-api
```

This example demonstrates how to leverage promptfoo's powerful extensions API to implement custom setup and teardown hooks for individual tests. These extensions can be defined in either Python or JavaScript, providing flexibility for your preferred programming environment.

## Extension Hooks Overview

promptfoo supports four types of extension hooks, each triggered at a specific point in the evaluation lifecycle:

1. `beforeAll`: Executed once before the entire test suite begins
2. `afterAll`: Executed once after the entire test suite completes
3. `beforeEach`: Executed before each individual test
4. `afterEach`: Executed after each individual test

Each hook receives a `hookName` parameter and a `context` object containing relevant data for that specific hook type.

For comprehensive information on implementing and using these hooks, refer to the [Extension Hooks](https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks) section in the official documentation.

## Hook Return Values

Extension hooks can return values that become available to other parts of the evaluation system. This powerful feature enables data sharing between hooks and custom providers.

### How Return Values Work

1. **Returning Values from Hooks**: The `beforeAll` and `beforeEach` hooks can return values that are accessible to providers.

   ```javascript
   // JavaScript example
   if (hookName === 'beforeAll') {
     return { trace_id: 'pf-trace-494949' };
   }
   ```

   ```python
   # Python example
   if hook_name == "beforeAll":
       return True
   ```

2. **Accessing Return Values**: Return values from hooks are made available through `context.extensionHookOutputs`:

   ```javascript
   // In a custom provider
   const [{ trace_id: traceId }] = context.extensionHookOutputs.beforeAll;
   ```

3. **Multiple Extensions**: When using multiple extensions, `extensionHookOutputs` contains an array of return values in the order the extensions were defined.

### Example Usage in This Project

This example demonstrates a practical use case where:

1. The `beforeAll` hook generates a trace ID (`pf-trace-494949`)
2. The custom OpenAI provider retrieves this trace ID from `context.extensionHookOutputs.beforeAll`
3. The provider includes the trace ID in the API metadata and returns it in the output
4. Test assertions verify that the trace ID is present in the response:
   ```yaml
   defaultTest:
     assert:
       - type: contains
         value: 'pf-trace-494949'
   ```

This pattern is useful for:

- **Request Tracing**: Passing correlation IDs through your entire test flow
- **Authentication**: Sharing authentication tokens obtained in `beforeAll`
- **Configuration**: Passing dynamic configuration values to providers
- **State Management**: Sharing setup results between hooks and test execution

## Configuring Extensions

Specify your extensions in the `promptfooconfig.yaml` file:

```yaml
extensions:
  - file://path/to/your/extension.py:extension_hook
  - file://path/to/your/extension.js:extensionHook
```

Note: You must include the function name after the file path, separated by a colon (`:`).

## Why Use Extensions?

Extensions in promptfoo empower you to:

1. Enhance test functionality with custom pre- and post-test actions
2. Dynamically prepare and clean up test environments
3. Seamlessly integrate with external systems or services for comprehensive testing
4. Implement custom logging or reporting mechanisms

These extensions function similarly to "before" and "after" hooks in popular unit testing frameworks, allowing you to set up and tear down test environments with precision and control.

## Practical Use Cases for Extensions

1. **Environment Setup/Teardown**: Dynamically create and remove files or resources for each test.
2. **AI Agent Testing**: Configure complex scenarios, such as deploying Kubernetes manifests before evaluation.
3. **Model Loading**: Efficiently load ML models into memory before tests and unload them afterward.
4. **Local Server Management**: Programmatically start and stop local language model servers (e.g., llama.cpp, ollama) for testing.
5. **Connection Management**: Automate the opening and closing of connection tunnels or database connections.
6. **Credential Handling**: Securely load and manage credentials or authentication tokens for testing environments.

## Running the Example

To execute this example, use the following command in your terminal:

```sh
LOG_LEVEL=debug promptfoo eval
```

Then

```sh
promptfoo view
```
