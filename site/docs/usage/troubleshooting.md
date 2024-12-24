---
sidebar_position: 60
---

# Troubleshooting

## Out of memory error

If you have a large number of tests or your tests have large outputs, you may encounter an out of memory error. There are several ways to handle this:

### Basic setup

Follow **all** of these steps:

1. Do not use the `--no-write` flag. We need to write to disk to avoid memory issues.
2. Use the `--no-table` flag.
3. Only output to `jsonl` ex: `--output results.jsonl`

### Granular memory optimization

You can selectively strip out heavy data from the results using environment variables:

```bash
# Strip prompt text (useful if your prompts contain large amounts of text or images)
export PROMPTFOO_STRIP_PROMPT_TEXT=true

# Strip model outputs (useful if your model generates large responses)
export PROMPTFOO_STRIP_RESPONSE_OUTPUT=true

# Strip test variables (useful if your test cases contain large datasets)
export PROMPTFOO_STRIP_TEST_VARS=true

# Strip grading results (useful if you're using model-graded assertions)
export PROMPTFOO_STRIP_GRADING_RESULT=true

# Strip metadata (useful if you're storing large amounts of custom metadata)
export PROMPTFOO_STRIP_METADATA=true
```

You can use any combination of these variables to optimize memory usage while preserving the data you need.

### Increase Node.js memory limit

If you're still encountering memory issues after trying the above options, you can increase the amount of memory available to Promptfoo by setting the `NODE_OPTIONS` environment variable:

```bash
# 8192 MB is 8 GB. Set this to an appropriate value for your machine.
NODE_OPTIONS="--max-old-space-size=8192" promptfoo eval
```

## OpenAI API key is not set

If you're using OpenAI, you set the `OPENAI_API_KEY` environment variable or add `apiKey` to the provider config.

If you're not using OpenAI but still receiving this message, you probably have some [model-graded metric](/docs/configuration/expected-outputs/model-graded/) such as `llm-rubric` or `similar` that requires you to [override the grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).

Follow the instructions to override the grader, e.g. using the `defaultTest` property.

In this example, we're overriding the text and embedding providers to use Azure OpenAI (gpt-4o for text, and ada-002 for embedding).

```yaml
defaultTest:
  options:
    provider:
      text:
        id: azureopenai:chat:gpt-4o-deployment
        config:
          apiHost: xxx.openai.azure.com
      embedding:
        id: azureopenai:embeddings:text-embedding-ada-002-deployment
        config:
          apiHost: xxx.openai.azure.com
```

## Timeout errors

When running evals, you may encounter timeout errors, especially when using local providers or when running many concurrent requests. These timeouts can manifest as generic errors or as a lack of useful error messages.

To resolve timeout issues, try limiting concurrency by using the `-j 1` flag when running `promptfoo eval`. This reduces the number of simultaneous requests:

```
promptfoo eval -j 1
```

## Debugging Python

When using custom Python providers, prompts, hooks, assertions, etc., you may need to debug your Python code. Here are some tips to help you troubleshoot issues:

### Viewing Python output

To see the output from your Python script, including print statements, set the `LOG_LEVEL` environment variable to `debug` when running your eval:

```bash
LOG_LEVEL=debug promptfoo eval
```

Alternatively, you can use the `--verbose` flag:

```bash
promptfoo eval --verbose
```

### Using a debugger

While standard Python debuggers like `pdb` are not directly supported, you can use `remote-pdb` for debugging. First, install `remote-pdb`:

```bash
pip install remote-pdb
```

Then, add the following lines to your Python script where you want to set a breakpoint:

```python
from remote_pdb import RemotePdb
RemotePdb('127.0.0.1', 4444).set_trace()
```

When your code reaches this point, it will pause execution and wait for you to connect to the debugger. You can then connect to the debugger using a tool like `telnet`:

```bash
telnet 127.0.0.1 4444
```

### Handling errors

If you encounter errors in your Python script, the error message and stack trace will be displayed in the promptfoo output. Make sure to check this information for clues about what might be going wrong in your code.

Remember that promptfoo runs your Python script in a separate process, so some standard debugging techniques may not work as expected. Using logging and remote debugging as described above are the most reliable ways to troubleshoot issues in your Python providers.

## Debugging the Database

1. Set environment variables:

   ```sh
   export PROMPTFOO_ENABLE_DATABASE_LOGS=true
   export LOG_LEVEL=debug
   ```

2. Run your command:

   ```sh
   promptfoo eval
   ```

3. Disable logging when done:

   ```sh
   unset PROMPTFOO_ENABLE_DATABASE_LOGS
   ```
