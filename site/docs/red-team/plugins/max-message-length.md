---
sidebar_label: Maximum Message Length
---

# Maximum Message Length Plugin

The Maximum Message Length plugin tests the upper limits of input size that your LLM can handle before encountering errors or degraded performance.

## Purpose

This plugin helps you:

1. Determine the exact character limits of your model
2. Identify failure modes when message limits are exceeded
3. Understand error patterns at boundary conditions
4. Plan for graceful handling of oversized inputs

## Overview

Different models have different maximum context windows, and different API implementations have different maximum request sizes. This plugin uses a binary search approach to efficiently find the exact character limit your deployment can handle.

## How it works

The plugin implements a specialized provider that:

1. Starts with a base message and progressively adds padding
2. Uses binary search to efficiently find the maximum successful length
3. Records error messages when failures occur
4. Reports detailed metadata about the maximum successful length

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
      startLength: 2000    # Initial message length to test
      stepSize: 10000      # Used for exponential growth calculation
      maxSteps: 15         # Maximum number of test iterations
```

## Sample output

```
Test completed. Maximum message length: 128,000 characters.
Maximum successful message length: 128,000 characters. 
Failed at 131,072 characters with error: Context length exceeded.
```

## Evaluation criteria

The plugin doesn't have pass/fail criteria - instead, it reports factual information about your model's limits:

- The maximum successful message length
- The length at which failure occurred (if any)
- The error message encountered (if any)
- The number of test iterations performed

## Importance in Gen AI Red Teaming

Understanding message length limits is crucial for:

- Preventing unexpected failures in production
- Planning graceful degradation for oversized inputs
- Setting appropriate limits in frontend applications
- Optimizing context window usage for cost efficiency
- Understanding token vs. character limits

## Related Concepts

- [Reasoning DoS](reasoning-dos.md)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) 