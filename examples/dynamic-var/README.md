# dynamic-var (Dynamic Variable Generation)

This example demonstrates how to use JavaScript or Python scripts to dynamically generate variable values at runtime. This is particularly useful for:

- **RAG applications**: Retrieve context documents based on the user's question
- **Personalization**: Generate content tailored to user attributes
- **Dynamic test data**: Create test inputs that depend on other variables

## Quick Start

```bash
npx promptfoo@latest init --example dynamic-var
```

Set your `OPENAI_API_KEY` environment variable, then run:

```bash
promptfoo eval
```

View results with `promptfoo view`.

## How It Works

When you reference a JavaScript or Python file in a variable using `file://`, promptfoo executes the script at runtime instead of reading it as text:

```yaml
tests:
  - vars:
      question: 'What is the vacation policy?'
      context: file://load_context.py # This script is EXECUTED, not read as text
```

The script receives information about the current test case and can use other variables to generate its output dynamically.

## Function Signature

### Python

```python
def get_var(var_name: str, prompt: str, other_vars: dict) -> dict:
    """
    Args:
        var_name: Name of the variable being loaded (e.g., "context")
        prompt: The prompt template string
        other_vars: Dictionary of other variables in the test case

    Returns:
        {"output": "the variable value"}
        # or {"error": "error message"} if something went wrong
    """
    question = other_vars.get("question", "")
    context = retrieve_relevant_docs(question)
    return {"output": context}
```

### JavaScript

```javascript
module.exports = async function (varName, prompt, otherVars, provider) {
  // varName: Name of the variable being loaded
  // prompt: The prompt template string
  // otherVars: Object with other variables in the test case
  // provider: The provider being used (optional)

  const question = otherVars.question || '';
  const context = await retrieveRelevantDocs(question);

  return { output: context };
  // or { error: "error message" } if something went wrong
};
```

## Example: RAG Context Retrieval

This example simulates a RAG (Retrieval-Augmented Generation) application where the context loaded depends on the question being asked:

```yaml
tests:
  - vars:
      question: 'What is the parental leave policy?'
      context: file://load_context.py # Loads parental leave docs

  - vars:
      question: 'How many vacation days do I get?'
      context: file://load_context.py # Loads vacation policy docs
```

The `load_context.py` script:

1. Receives the `question` variable via `other_vars`
2. Retrieves relevant documents based on the question
3. Returns the context to be inserted into the prompt

## Using JavaScript Instead

To use the JavaScript implementation, change the file reference:

```yaml
tests:
  - vars:
      question: 'What is the vacation policy?'
      context: file://load_context.js
```

## Real-World Use Cases

### 1. Vector Database Retrieval

```python
def get_var(var_name, prompt, other_vars):
    question = other_vars["question"]
    embeddings = generate_embeddings(question)
    docs = vector_db.similarity_search(embeddings, k=5)
    return {"output": "\n".join(docs)}
```

### 2. User-Specific Content

```python
def get_var(var_name, prompt, other_vars):
    user_id = other_vars["user_id"]
    user_prefs = database.get_preferences(user_id)
    return {"output": format_preferences(user_prefs)}
```

### 3. API-Based Data Loading

```javascript
module.exports = async function (varName, prompt, otherVars) {
  const productId = otherVars.product_id;
  const response = await fetch(`https://api.example.com/products/${productId}`);
  const product = await response.json();
  return { output: JSON.stringify(product) };
};
```

## Tips

- The script is executed once per test case
- Use `other_vars` to access variables defined in the same test case
- Return `{"error": "message"}` to fail the test with a clear error
- Scripts can be async (JavaScript) or use async libraries (Python)
