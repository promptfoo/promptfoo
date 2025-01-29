---
sidebar_label: Custom scripts
---

# Custom scripts

You may use any shell command as an API provider. This is particularly useful when you want to use a language or framework that is not directly supported by promptfoo.

While Script Providers are particularly useful for evaluating chains, they can generally be used to test your prompts if they are implemented in Python or some other language.

:::tip
**Python users**: there is a dedicated [`python` provider](/docs/providers/python) that you may find easier to use.

**Javascript users**: see how to implement [`ApiProvider`](/docs/providers/custom-api).
:::

To use a script provider, you need to create an executable that takes a prompt as its first argument and returns the result of the API call. The script should be able to be invoked from the command line.

Here is an example of how to use a script provider:

```yaml
providers:
  - 'exec: python chain.py'
```

Or in the CLI:

```
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv  -v vars.csv -r 'exec: python chain.py'
```

In the above example, `chain.py` is a Python script that takes a prompt as an argument, executes an LLM chain, and outputs the result.

For a more in-depth example of a script provider, see the [LLM Chain](/docs/configuration/testing-llm-chains#using-a-script-provider) example.
