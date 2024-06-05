---
sidebar_position: 51
---

# Custom Python

The `python` provider allows you to use a Python script as an API provider for evaluating prompts. This is useful when you have custom logic or models implemented in Python that you want to integrate with your test suite.

### Configuration

To configure the Python provider, you need to specify the path to your Python script and any additional options you want to pass to the script. Here's an example configuration in YAML format:

```yaml
providers:
  - id: 'python:my_script.py'
    label: 'Test script 1' # Optional display label for this provider
    config:
      additionalOption: 123
```

### Python script

Your Python script should accept a prompt, options, and context as arguments. It should return a JSON-encoded `ProviderResponse`.

- The `ProviderResponse` must include an `output` field containing the result of the API call.
- Optionally, it can include an `error` field if something goes wrong, and a `tokenUsage` field to report the number of tokens used.

Here's an example of a Python script that could be used with the Python provider, which includes handling for the prompt, options, and context:

```python
# my_script.py
import json

def call_api(prompt, options, context):
    # The 'options' parameter contains additional configuration for the API call.
    config = options.get('config', None)
    additional_option = config.get('additionalOption', None)

    # The 'context' parameter provides info about which vars were used to create the final prompt.
    user_variable = context['vars'].get('userVariable', None)

    # The prompt is the final prompt string after the variables have been processed.
    # Custom logic to process the prompt goes here.
    # For instance, you might call an external API or run some computations.
    output = call_llm(prompt)


    # The result should be a dictionary with at least an 'output' field.
    result = {
        "output": output,
    }

    if some_error_condition:
        result['error'] = "An error occurred during processing"

    if token_usage_calculated:
        # If you want to report token usage, you can set the 'tokenUsage' field.
        result['tokenUsage'] = {"total": token_count, "prompt": prompt_token_count, "completion": completion_token_count}

    return result
```

### Types

The types passed into the Python script function and the `ProviderResponse` return type are defined as follows:

```python
class ProviderOptions:
    id: Optional[str]
    config: Optional[Dict[str, Any]]

class CallApiContextParams:
    vars: Dict[str, str]

class TokenUsage:
    total: int
    prompt: int
    completion: int

class ProviderResponse:
    output: Optional[Union[str, Dict[str, Any]]]
    error: Optional[str]
    tokenUsage: Optional[TokenUsage]
    cost: Optional[float]
    cached: Optional[bool]
    logProbs: Optional[List[float]]
```

### Setting the Python executable

In some scenarios, you may need to specify a custom Python executable. This is particularly useful when working with virtual environments or when the default Python path does not point to the desired Python interpreter.

Here's an example of how you can override the Python executable using the `pythonExecutable` option:

```yaml
providers:
  - id: 'python:my_script.py'
    config:
      pythonExecutable: /path/to/python3.11
```

### Troubleshooting

#### Viewing python output

If you use `print` statements in your python script, set `LOG_LEVEL=debug` to view script invocations and output:

```sh
LOG_LEVEL=debug npx promptfoo@latest eval
```

#### Setting the Python binary path

If you are using a specific Python binary (e.g. from a virtualenv or poetry), set the `PROMPTFOO_PYTHON` environment variable to be the binary location.

Also note that promptfoo will respect the `PYTHONPATH`. You can use this to tell the python interpreter where your custom modules live.

For example:

```sh
PROMPTFOO_PYTHON=venv/bin/python3.9 PYTHONPATH=/usr/lib/foo npx promptfoo@latest eval
```
