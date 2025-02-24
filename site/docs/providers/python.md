---
sidebar_label: Custom Python
---

# Python Provider

The `python` provider allows you to use a Python script as an API provider for evaluating prompts. This is useful when you have custom logic or models implemented in Python that you want to integrate with your test suite.

### Configuration

To configure the Python provider, you need to specify the path to your Python script and any additional options you want to pass to the script. Here's an example configuration in YAML format:

```yaml
providers:
  - id: 'file://my_script.py'
    label: 'Test script 1' # Optional display label for this provider
    config:
      additionalOption: 123
```

### Python script

Your Python script should implement a function that accepts a prompt, options, and context as arguments. It should return a JSON-encoded `ProviderResponse`.

- The `ProviderResponse` must include an `output` field containing the result of the API call.
- Optionally, it can include an `error` field if something goes wrong, and a `tokenUsage` field to report the number of tokens used.
- By default, supported functions are `call_api`, `call_embedding_api`, and `call_classification_api`. To override the function name, specify the script like so: `file://my_script.py:function_name`

Here's an example of a Python script that could be used with the Python provider, which includes handling for the prompt, options, and context:

```python title="my_script.py"
import json

# Type hints are optional. You can use either:
# 1. Simple types: Dict[str, Any]
# 2. Full type definitions from the Types section below (recommended for better type checking)
from typing import Dict, List, Optional, Union, Any, TypedDict
import logging

def call_api(prompt: str, options: ProviderOptions, context: CallApiContextParams) -> ProviderResponse:
    """
    You can use simple Dict[str, Any] for options and context if you prefer,
    or use the full type definitions from the Types section below for better type checking.
    """
    # Note: The prompt may be in JSON format, so you might need to parse it.
    # For example, if the prompt is a JSON string representing a conversation:
    # prompt = '[{"role": "user", "content": "Hello, world!"}]'
    # You would parse it like this:
    # prompt = json.loads(prompt)

    # The 'options' parameter contains additional configuration for the API call.
    config = options.get('config', None)
    additional_option = config.get('additionalOption', None)

    # The 'context' parameter provides info about which vars were used to create the final prompt.
    user_variable = context['vars'].get('userVariable', None)

    # The prompt is the final prompt string after the variables have been processed.
    # Custom logic to process the prompt goes here.
    # For instance, you might call an external API or run some computations.
    # TODO: Replace with actual LLM API implementation.
    def call_llm(prompt):
        return f"Stub response for prompt: {prompt}"

    try:
        output = call_llm(prompt)
    except Exception as e:
        return {
            "error": str(e),
        }

    # The result should be a dictionary with at least an 'output' field.
    result = {
        "output": output,
    }

    if some_error_condition:
        result['error'] = "An error occurred during processing"

    if token_usage_calculated:
        # If you want to report token usage, you can set the 'tokenUsage' field.
        result['tokenUsage'] = {"total": token_count, "prompt": prompt_token_count, "completion": completion_token_count}

    if failed_guardrails:
        # If guardrails triggered, you can set the 'guardrails' field.
        result['guardrails'] = {"flagged": True}

    return result

def call_embedding_api(prompt: str) -> ProviderEmbeddingResponse:
    # Returns ProviderEmbeddingResponse
    pass

def call_classification_api(prompt: str) -> ProviderClassificationResponse:
    # Returns ProviderClassificationResponse
    pass
```

### Types

To use type hints in your Python script, you'll need these imports:

```python
from typing import Dict, List, Optional, Union, Any, TypedDict
import logging

# For Python < 3.8, use:
# from typing_extensions import TypedDict
```

Here are the expected dictionary structures:

```python
class TokenUsage(TypedDict, total=False):
    total: int       # Total tokens used
    prompt: int      # Tokens in the prompt
    completion: int  # Tokens in the completion

class GuardrailResponse(TypedDict, total=False):
    flaggedInput: bool    # Whether the input triggered content filters
    flaggedOutput: bool   # Whether the output triggered content filters
    flagged: bool         # Whether either input or output was flagged

class ProviderOptions(TypedDict, total=False):
    id: str                # Provider identifier
    config: Dict[str, Any] # Configuration from promptfoo.yaml

class CallApiContextParams(TypedDict, total=False):
    vars: Dict[str, Union[str, object]]  # Variables used in prompt
    filters: Dict[str, Any]              # Nunjucks filters
    logger: logging.Logger               # Logger instance
    debug: bool                          # Debug mode flag
    fetchWithCache: Any                  # Cache-enabled fetch
    getCache: Any                        # Cache getter

class ProviderResponse(TypedDict, total=False):
    output: Union[str, Dict[str, Any]]  # Required: The main response (must be included despite total=False)
    error: Optional[str]                # Error message if something went wrong
    tokenUsage: Optional[TokenUsage]    # Token usage statistics
    cost: Optional[float]               # Cost of the API call
    cached: Optional[bool]              # Whether response was cached
    logProbs: Optional[List[float]]     # Log probabilities
    metadata: Optional[Dict[str, Any]]  # Debug info (shows in detail view)
    raw: Optional[Union[str, Any]]      # Raw provider response
    isRefusal: Optional[bool]           # Whether model refused to respond
    sessionId: Optional[str]            # Session identifier
    guardrails: Optional[GuardrailResponse]  # Content filtering results

class ProviderEmbeddingResponse(TypedDict, total=False):
    embedding: List[float]           # Vector embedding
    tokenUsage: Optional[TokenUsage] # Token usage stats
    cached: Optional[bool]           # Whether response was cached

class ProviderClassificationResponse(TypedDict, total=False):
    classification: Dict[str, Any]   # Classification results
    tokenUsage: Optional[TokenUsage] # Token usage stats
    cached: Optional[bool]           # Whether response was cached
```

In practice, you'll return dictionaries that match these structures. For example:

```python
def call_api(prompt: str, options: ProviderOptions, context: CallApiContextParams) -> ProviderResponse:
    return {
        "output": "Response text",
        "tokenUsage": {
            "total": 10,
            "prompt": 5,
            "completion": 5
        },
        "metadata": {
            "model": "gpt-3.5-turbo"
        }
    }
```

The only required field in the response is `output`. All other fields are optional and can be included as needed. These type definitions are compatible with mypy's strict type checking.

### Response Fields and Error Handling

When implementing a Python provider, your function should return a structured response with these key fields:

- `output` (required): The main response from your provider. Can be a string or any JSON-serializable data structure.
- `error` (optional): Error message if something goes wrong. Use this for user-facing error messages.
- `metadata` (optional): Additional context or debug information. Useful for troubleshooting or providing extra details about the response.

Example of good error handling:

```python
def call_api(prompt: str, options: ProviderOptions, context: CallApiContextParams) -> ProviderResponse:
    try:
        # Validate inputs
        if not prompt:
            return {"error": "Prompt cannot be empty"}

        # Try to parse JSON if needed
        try:
            prompt_data = json.loads(prompt)
        except json.JSONDecodeError:
            # Handle non-JSON prompts gracefully
            prompt_data = prompt

        # Call your API or processing logic
        result = process_prompt(prompt_data)

        return {
            "output": result,
            "metadata": {
                "prompt_type": type(prompt_data).__name__,
                "processing_info": "Additional debug info here"
            }
        }

    except ConnectionError as e:
        return {
            "error": "Failed to connect to backend service",
            "metadata": {"original_error": str(e)}
        }
    except Exception as e:
        return {
            "error": "Unexpected error during processing",
            "metadata": {
                "error_type": type(e).__name__,
                "error_details": str(e)
            }
        }
```

Best practices for error handling:

1. Always return user-friendly error messages in the `error` field
2. Use the `metadata` field to include technical details useful for debugging
3. Handle common error cases explicitly (e.g., JSON parsing, network errors)
4. Validate inputs before processing
5. Never expose sensitive information in error messages

### Setting the Python executable

In some scenarios, you may need to specify a custom Python executable. This is particularly useful when working with virtual environments or when the default Python path does not point to the desired Python interpreter.

Here's an example of how you can override the Python executable using the `pythonExecutable` option:

```yaml
providers:
  - id: 'file://my_script.py'
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
