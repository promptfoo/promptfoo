---
sidebar_label: Manual Input
---

# Manual Input Provider

The Manual Input Provider allows you to manually enter responses for each prompt during the evaluation process. This can be useful for testing, debugging, or when you want to provide custom responses without relying on an automated API.

## Configuration

To use the provider, set the provider id to `promptfoo:manual-input` in your configuration file:

```yaml
providers:
  - promptfoo:manual-input
```

By default, the provider will prompt the user on the CLI for a single line of output. To open an editor that supports multiline input:

```yaml
providers:
  - id: promptfoo:manual-input
    config:
      multiline: true
```

## Usage

To make manual input easier on the command line, set concurrency to 1 and disable progress bars:

```sh
promptfoo eval -j 1 --no-progress-bar
```
