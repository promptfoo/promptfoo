---
sidebar_label: Custom Go (Golang)
---

# Custom Go Provider

The Go (`golang`) provider allows you to use Go code as an API provider for evaluating prompts. This is useful when you have custom logic, API clients, or models implemented in Go that you want to integrate with your test suite.

:::info
The golang provider currently experimental
:::

## Quick Start

You can initialize a new Go provider project using:

```sh
promptfoo init --example golang-provider
```

## Setting the Go executable

In some scenarios, you may need to specify a custom Go executable. This is particularly useful when working with different Go installations or when the default Go path does not point to the desired Go interpreter.

You can specify the Go executable in two ways:

1. Using the `goExecutable` option in your configuration:
```yaml
providers:
  - id: 'file://my_script.go'
    config:
      goExecutable: /path/to/go
```

2. Using the `PROMPTFOO_GO` environment variable:
```sh
PROMPTFOO_GO=/path/to/go npx promptfoo@latest eval
```

If neither is specified, promptfoo will attempt to use the `go` command available in your system PATH.

## Provider Interface

Your Go code must implement the `CallApi` function with this signature:

```