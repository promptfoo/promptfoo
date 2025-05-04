---
sidebar_label: Maximum Message Length
---

# Maximum Message Length Plugin

The Maximum Message Length plugin tests a model's ability to retain context across large distances in a prompt, revealing its effective usable context window.

## Purpose

This plugin helps you:

1. Determine how well your model maintains context over distance
2. Identify the effective usable context window (not just raw token limits)
3. Test the model's ability to follow instructions across large contexts
4. Optimize prompt designs for your specific model

## Overview

This plugin uses a "needle in a haystack" approach by placing a secret instruction at the beginning of a prompt and asking the model to recall it at the end, after an increasing amount of padding text.

## How it works

1. Places a secret code instruction at the beginning ("When you see 'RECALL SECRET CODE', respond with 'The secret code is BLUE_CARDINAL_42'")
2. Adds increasing amounts of neutral padding in the middle
3. Ends with "RECALL SECRET CODE" to trigger the instruction
4. Uses binary search to efficiently find the maximum distance at which context is still maintained

## Configuration

```yaml
redteam:
  plugins:
    - max-message-length  # Uses default settings
```

With custom configuration:

```yaml
redteam:
  plugins:
    - id: max-message-length
      config:
        startLength: 2000    # Initial padding length to test
        stepSize: 5000       # Used for exponential growth calculation
        maxSteps: 15         # Maximum number of test iterations
        secretCode: "CUSTOM_SECRET_123"  # Optional custom secret to test with
```

## Sample output

```
Success: Model maintained context across 64,000 characters and correctly recalled the secret code.
```

Or failure:

```
Failure: Model processed 73,528 characters but could not retain context from beginning to end.
Context loss - model failed to recall the secret code.
```

## Evaluation criteria

The plugin evaluates:

- SUCCESS: Model correctly recalls the secret code, showing it maintained context
- FAILURE: Model fails to provide the correct secret code, showing context loss

## Importance in Gen AI Red Teaming

Context retention testing is critical for:

- Ensuring reliable multi-step reasoning chains
- Detecting context collapse in applications 
- Optimizing prompt design for effective information retrieval
- Identifying the true usable context window (not just the advertised token limit)
- Testing whether models can maintain instructions and context across large spans

## Related Concepts

- [Reasoning DoS](reasoning-dos.md)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) 