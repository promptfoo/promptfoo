# Python Guidelines

For Python providers, prompts, assertions, and scripts.

## Requirements

- Python 3.9 or later
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
