# Custom Plugins Example

This example demonstrates how to use promptfoo's extensions API to implement setup/teardown hooks for individual tests.

## Why Use Extensions?

Extensions in promptfoo allow you to:

1. Enhance test functionality with custom pre- and post-test actions
2. Prepare and clean up test environments dynamically
3. Integrate with external systems or services for comprehensive testing

Extensions function similarly to "before" and "after" hooks in unit testing frameworks like Jest, allowing you to set up and tear down test environments for each evaluation.

## Running the Example

```
LOG_LEVEL=debug promptfoo eval
```

## Using Extensions

Specify extensions in your `promptfooconfig.yaml`:

```yaml
extensions:
  - python:customPlugin.py
```

## Example Use Cases

1. **Environment Setup/Teardown**: Create and remove files or resources for each test.

2. **AI Agent Testing**: Set up complex scenarios, like deploying Kubernetes manifests before running an eval.

3. **Model Loading**: Load ML models into memory before running tests and unload them after.

4. **Local Server Management**: Start and stop local language model servers (e.g., llama.cpp, ollama) for testing.

5. **Connection Management**: Open and close connection tunnels or database connections.

6. **Credential Handling**: Load and manage credentials or authentication tokens for secure testing environments.
