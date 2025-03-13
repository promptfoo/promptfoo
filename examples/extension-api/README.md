# Custom Extensions Example for promptfoo

This example demonstrates how to leverage promptfoo's powerful extensions API to implement custom setup and teardown hooks for individual tests. These extensions can be defined in either Python or JavaScript, providing flexibility for your preferred programming environment.

## Extension Hooks Overview

promptfoo supports four types of extension hooks, each triggered at a specific point in the evaluation lifecycle:

1. `beforeAll`: Executed once before the entire test suite begins
2. `afterAll`: Executed once after the entire test suite completes
3. `beforeEach`: Executed before each individual test
4. `afterEach`: Executed after each individual test

Each hook receives a `hookName` parameter and a `context` object containing relevant data for that specific hook type.

For comprehensive information on implementing and using these hooks, refer to the [Extension Hooks](https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks) section in the official documentation.

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
