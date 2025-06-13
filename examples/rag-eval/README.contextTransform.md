# rag-eval (contextTransform approach)

This example demonstrates how to use `contextTransform` to extract context from RAG provider responses for evaluation, as an alternative to using separate context variables.

## Overview

Many RAG systems return both the generated answer and the retrieved context in their response. Instead of needing separate context variables, you can use `contextTransform` to extract the context directly from the provider response.

You can run this example with:

```bash
npx promptfoo@latest init --example rag-eval
```

## What this example shows

- **contextTransform usage**: Extract context from provider responses using JavaScript expressions
- **RAG evaluation**: Compare traditional context variables vs contextTransform approach
- **Real-world simulation**: Mock provider that includes retrieved context in responses

## Key features demonstrated

### Simple context extraction
```yaml
- type: context-faithfulness
  contextTransform: 'output.split("CONTEXT:")[1]?.split("ANSWER:")[0]?.trim() || ""'
  threshold: 0.9
```

### Multiple context assertions
All three context assertions work with `contextTransform`:
- `context-faithfulness` - Checks if the answer is faithful to the context
- `context-relevance` - Checks if the context is relevant to the query  
- `context-recall` - Checks if the context contains expected information

## Running the examples

### Traditional approach (context variables)
```bash
npm run local -- eval -c examples/rag-eval/promptfooconfig.yaml
```

### contextTransform approach
```bash
npm run local -- eval -c examples/rag-eval/promptfooconfig.contextTransform.yaml
```

## Provider response format

The contextTransform example uses a provider that returns responses like:
```
CONTEXT: Company Policy: Maximum purchase without approval is $500...

ANSWER: The maximum purchase amount that does not require approval is $500...
```

The `contextTransform` expression extracts everything between "CONTEXT:" and "ANSWER:" markers.

## When to use contextTransform

Use `contextTransform` when:
- Your RAG system returns context alongside the generated response
- You want to evaluate the actual context used by the model
- You need to extract context from structured or formatted responses
- You want to avoid managing separate context variables

Use traditional context variables when:
- You have explicit control over the context being used
- Your provider only returns the generated answer
- You want to test specific context scenarios 