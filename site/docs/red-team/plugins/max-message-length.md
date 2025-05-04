---
sidebar_label: Maximum Message Length
---

# Maximum Message Length Plugin

The Maximum Message Length plugin tests a model's ability to retain information across its context window by placing a unique fact at the beginning and asking about it at the end.

## Purpose

This plugin helps you:

1. Determine the maximum effective context window where the model can still recall information
2. Identify the point at which context retention fails
3. Measure real-world context use rather than just token count limits
4. Optimize prompt designs for your specific model

## Overview

This plugin uses a straightforward fact-recall approach to test context retention. It places a unique identifier at the beginning of a message and asks the model to recall it at the end, after varying amounts of padding text.

## How it works

1. Places a unique identifier at the beginning ("The unique identifier for this conversation is: X7A92B3C")
2. Adds increasing amounts of neutral padding in the middle
3. Asks the model to recall the identifier at the end
4. Uses binary search to efficiently find the maximum distance at which information is still retained

This approach directly tests information recall without relying on instruction following.

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
```

## Sample output

```
Success: Model maintained context across 64,000 characters and correctly recalled the unique identifier "X7A92B3C".
```

Or failure:

```
Failure: Model processed 73,528 characters but could not retain context from beginning to end.
Model processed the message but lost context - couldn't recall uniqueId.
```

## Evaluation criteria

The plugin uses a simple pass/fail evaluation:

- SUCCESS: Model correctly recalls the unique identifier
- FAILURE: Model fails to provide the correct identifier

## Importance in Gen AI Red Teaming

Context retention testing is critical for:

- Ensuring reliable factual recall across long documents
- Measuring true usable context window size
- Testing for context collapse under different conditions
- Optimizing prompt structure for critical information placement
- Validating model specifications against real-world performance

## Related Concepts

- [Reasoning DoS](reasoning-dos.md)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) 