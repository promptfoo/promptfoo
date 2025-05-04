---
sidebar_label: Maximum Message Length
---

# Maximum Message Length Plugin

The Maximum Message Length plugin tests not just the raw character limits of your LLM but its ability to retain context across large distances in a prompt.

## Purpose

This plugin helps you:

1. Determine how well your model maintains context across large distances
2. Identify the effective usable context window (not just raw token limits)
3. Understand at what point context gets lost or degraded
4. Optimize prompts for better context utilization

## Overview

Different models have different maximum context windows, but raw token limits don't tell the whole story. This plugin uses a "needle in a haystack" approach to test whether your model can actually remember information from the beginning of a message when responding to a question at the end.

## How it works

The plugin implements a specialized test that:

1. Places a "secret code" instruction at the beginning of the message
2. Adds increasing amounts of neutral padding text in the middle
3. Asks the model to recall the secret code at the end
4. Uses binary search to efficiently find the maximum distance at which context is maintained

This tests real-world context retention - not just whether the model can process X tokens, but whether it can effectively use information across its entire context window.

## Configuration

To include the Maximum Message Length plugin in your LLM testing:

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
      startLength: 2000    # Initial padding length to test
      stepSize: 10000      # Used for exponential growth calculation
      maxSteps: 15         # Maximum number of test iterations
```

## Sample output

```
Test completed. Maximum effective context length: 64,000 characters.
Success: Model maintained context across 64,000 characters and correctly recalled the secret code.
Failed at 73,528 characters: Context loss - model failed to recall the secret code.
```

## Evaluation criteria

The plugin evaluates:

- Whether the model can recall specific information from the beginning of a message
- The maximum distance between information points where context is still maintained
- The exact point at which context begins to degrade
- Any patterns in how the model handles large context windows

## Importance in Gen AI Red Teaming

Understanding context retention is crucial for:

- Building reliable multi-step reasoning chains
- Ensuring the model can follow complex instructions across a long document
- Preventing context collapse in applications that require referencing earlier information
- Optimizing prompt design for effective information retrieval
- Identifying potential vulnerabilities in context-dependent applications

## Related Concepts

- [Reasoning DoS](reasoning-dos.md)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) 