# Python Guidelines

For Python providers, prompts, assertions, and scripts.

## Requirements

- Python 3.8 or later
- Follow [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)
- Use type hints for readability and error catching

## Linting & Formatting

Use `ruff` for both:

```bash
ruff check --fix           # Lint with auto-fix
ruff check --select I --fix # Sort imports
ruff format                 # Format code
```

## Testing

Use the built-in `unittest` module for new Python tests.

## Best Practices

- Keep dependencies minimal - avoid unnecessary external packages
- When adding examples, update relevant `requirements.txt` files
- Follow promptfoo API patterns for custom providers/prompts/assertions
- Write unit tests for new Python functions

## Example Dependencies

List the packages each example imports or invokes. Add transitive dependencies
only for documented security or compatibility constraints. Put optional providers
and tracing integrations in separate install instructions when the default
example does not use them.

Test updates in a fresh virtual environment, run `python -m pip check`, and run
the example with the local CLI. Inspect the exported results for errors and
unexpected failures. Document the Python version and any credentials or services
needed to reproduce the run.

The Python example dependency workflow installs changed manifests on Python 3.12.
It checks all tracked example manifests when the workflow or selector changes,
and skips tool-only pyprojects without PEP 621 project metadata. Run the example
and check its minimum supported Python version separately.

## Provider Pattern

```python
def call_api(prompt: str, options: dict, context: dict) -> dict:
    """
    Args:
        prompt: The prompt string
        options: Provider configuration
        context: Variables from the test case

    Returns:
        dict with 'output' key (and optionally 'error')
    """
    # Implementation
    return {"output": response_text}
```

## Assertion Pattern

```python
def get_assert(output: str, context: dict) -> dict:
    """
    Args:
        output: The provider's output
        context: Test context including vars

    Returns:
        dict with 'pass' (bool) and optionally 'reason'
    """
    return {"pass": True, "reason": "Validation passed"}
```
