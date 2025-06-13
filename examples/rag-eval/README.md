# rag-eval

This example demonstrates RAG (Retrieval-Augmented Generation) evaluation using context-based assertions. It shows two approaches for providing context: traditional context variables and the new `contextTransform` feature.

You can run this example with:

```bash
npx promptfoo@latest init --example rag-eval
```

## Overview

RAG systems combine retrieval of relevant information with language model generation. This example shows how to evaluate RAG systems using promptfoo's context-based assertions:

- `context-faithfulness` - Checks if the answer is faithful to the context without hallucinations
- `context-relevance` - Checks if the context is relevant to the query  
- `context-recall` - Checks if the context contains expected information

## Prerequisites

Set your OpenAI API key:
```bash
export OPENAI_API_KEY=your_api_key_here
```

## Two Approaches for Context

### 1. Traditional Approach (Context Variables)

Uses separate `context` variables in your test cases:

```bash
promptfoo eval -c promptfooconfig.yaml
```

**Configuration example:**
```yaml
tests:
  - vars:
      query: What is the max purchase that doesn't require approval?
      context: file://docs/reimbursement.md
    assert:
      - type: context-faithfulness
        threshold: 0.9
      - type: context-relevance
        threshold: 0.9
```

**When to use:**
- You have explicit control over the context
- Testing specific context scenarios
- Your provider only returns the generated answer

### 2. contextTransform Approach

Extracts context directly from provider responses using JavaScript expressions:

```bash
promptfoo eval -c promptfooconfig.contextTransform.yaml
```

**Configuration example:**
```yaml
tests:
  - vars:
      query: What is the max purchase that doesn't require approval?
    assert:
      - type: context-faithfulness
        contextTransform: 'output.split("CONTEXT:")[1]?.split("ANSWER:")[0]?.trim() || ""'
        threshold: 0.9
```

**When to use:**
- Your RAG system returns context alongside the generated response
- You want to evaluate the actual context used by the model
- You need to extract context from structured or formatted responses

## Provider Response Format

The contextTransform example uses a provider that returns responses like:
```
CONTEXT: Company Policy: Maximum purchase without approval is $500...

ANSWER: The maximum purchase amount that does not require approval is $500...
```

The `contextTransform` expression extracts everything between "CONTEXT:" and "ANSWER:" markers.

## Key Features Demonstrated

### Simple context extraction
```yaml
- type: context-faithfulness
  contextTransform: 'output.context'
  threshold: 0.9
```

### Complex JavaScript expressions
```yaml
- type: context-relevance
  contextTransform: 'output.split("CONTEXT:")[1]?.split("ANSWER:")[0]?.trim() || ""'
  threshold: 0.8
```

### Multiple context assertions
All three context assertions work with both approaches:
- `context-faithfulness` - Prevents hallucinations
- `context-relevance` - Ensures relevant retrieval
- `context-recall` - Verifies information completeness

## Viewing Results

After running either configuration:

```bash
promptfoo view
```

This opens a web interface showing detailed evaluation results, including context assertion scores and explanations.
