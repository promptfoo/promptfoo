# dynamic-var (Dynamic Variable Generation)

Generate variable values at runtime using JavaScript or Python.

You can run this example with:

```bash
npx promptfoo@latest init --example dynamic-var
```

## Environment Variables

This example requires:

- `OPENAI_API_KEY` - Your OpenAI API key

## How It Works

Reference a script with `file://` in your vars. The script runs at evaluation time and can access other variables:

```yaml
tests:
  - vars:
      role: support
      query: 'My order is late'
      system_prompt: file://load_prompt.py # Loads support-specific prompt
```

The script receives the test context and returns the value:

```python
def get_var(var_name, prompt, other_vars):
    role = other_vars.get("role")
    return {"output": PROMPTS[role]}
```

## Function Signatures

**Python** - Define `get_var(var_name, prompt, other_vars)`:

```python
def get_var(var_name, prompt, other_vars):
    return {"output": "value"}  # or {"error": "message"}
```

**JavaScript** - Export a function:

```javascript
module.exports = async function (varName, prompt, otherVars, provider) {
  return { output: 'value' }; // or { error: "message" }
};
```

## Running the Example

```bash
promptfoo eval
promptfoo view
```
