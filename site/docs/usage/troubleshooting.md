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

If you're still encountering memory issues after trying the above options, you can increase the amount of memory available to promptfoo by setting the `NODE_OPTIONS` environment variable:

```bash
# 8192 MB is 8 GB. Set this to an appropriate value for your machine.
NODE_OPTIONS="--max-old-space-size=8192" npx promptfoo eval
```

## Object template handling

When working with complex data structures in templates, you might encounter issues with how objects are displayed or accessed in your prompts and grading rubrics.

### `[object Object]` appears in outputs

If you see `[object Object]` in your LLM outputs or grading results, this means JavaScript objects are being converted to their string representation without proper serialization. By default, promptfoo automatically stringifies objects to prevent this issue.

**Example problem:**

```yaml
prompts:
  - 'Product: {{product}}'
tests:
  - vars:
      product:
        name: 'Headphones'
        price: 99.99
# Results in: "Product: [object Object]" in outputs
```

**Default solution:** Objects are automatically converted to JSON strings:

```
Product: {"name":"Headphones","price":99.99}
```

### Accessing object properties in templates

If you need to access specific properties of objects in your templates (like `{{ product.name }}`), you can enable direct object access:

```bash
export PROMPTFOO_DISABLE_OBJECT_STRINGIFY=true
promptfoo eval
```

With this setting enabled, you can use object property access in templates:

```yaml
prompts:
  - 'Product: {{ product.name }} costs ${{ product.price }}'
# Results in: "Product: Headphones costs $99.99"
```

### When to use each approach

**Use default behavior (stringified objects) when:**

- You want objects as JSON strings in your prompts
- Working with existing templates that expect JSON strings
- You need maximum compatibility and don't want to see `[object Object]`

**Use object property access (`PROMPTFOO_DISABLE_OBJECT_STRINGIFY=true`) when:**

- You need to access specific properties like `{{ product.name }}`
- Building new templates designed for object navigation
- Working with complex nested data structures

## Node.js version mismatch error

When running `npx promptfoo@latest`, you might encounter this error:

```
Error: The module '/path/to/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 115. This version of Node.js requires
NODE_MODULE_VERSION 127. Please try re-compiling or re-installing
the module (for instance, using `npm rebuild` or `npm install`).
```

This happens because promptfoo uses native code modules (like better-sqlite3) that need to be compiled specifically for your Node.js version.

### Solution: Remove npx cache and reinstall

To fix this issue, run this single command:

```bash
rm -rf ~/.npm/_npx && npx -y promptfoo@latest
```

This removes any cached npm packages in the npx cache directory and forces a fresh download and installation of promptfoo, ensuring the native modules are compiled correctly for your current Node.js version.

## Native build failures

Some dependencies like [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) include native code that must compile locally. Ensure your machine has a C/C++ build toolchain:

- **Ubuntu/Debian**: `sudo apt-get install build-essential`
- **macOS**: `xcode-select --install`
- **Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

If the prebuilt binaries fail, force a local build:

```bash
npm install --build-from-source
# or
npm rebuild
```

## OpenAI API key is not set

If you're using OpenAI, set the `OPENAI_API_KEY` environment variable or add `apiKey` to the provider config.

If you're not using OpenAI but still receiving this message, you probably have some [model-graded metric](/docs/configuration/expected-outputs/model-graded/) such as `llm-rubric` or `similar` that requires you to [override the grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).

Follow the instructions to override the grader, e.g., using the `defaultTest` property:

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

## How to triage stuck evals

When running evals, you may encounter timeout errors, especially when using local providers or when running many concurrent requests. Here's how to fix them:

**Common use cases:**

- Ensure evaluations complete within a time limit (useful for CI/CD)
- Handle custom providers or providers that get stuck
- Prevent runaway costs from long-running evaluations

You can control two settings: timeout for individual test cases and timeout for the entire evaluation.

### Quick fixes

**Set timeouts for individual requests and total evaluation time:**

```bash
export PROMPTFOO_EVAL_TIMEOUT_MS=30000  # 30 seconds per request
export PROMPTFOO_MAX_EVAL_TIME_MS=300000  # 5 minutes total limit

npx promptfoo eval
```

You can also set these values in your `.env` file or Promptfoo config file:

```yaml title="promptfooconfig.yaml"
env:
  PROMPTFOO_EVAL_TIMEOUT_MS: 30000
  PROMPTFOO_MAX_EVAL_TIME_MS: 300000
```

## Debugging Python

When using custom Python providers, prompts, hooks, assertions, etc., you may need to debug your Python code. Here are some tips to help you troubleshoot issues:

### Viewing Python output

To see the output from your Python script, including print statements, set the `LOG_LEVEL` environment variable to `debug` when running your eval:

```bash
LOG_LEVEL=debug npx promptfoo eval
```

Alternatively, you can use the `--verbose` flag:

```bash
npx promptfoo eval --verbose
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

   ```bash
   export PROMPTFOO_ENABLE_DATABASE_LOGS=true
   export LOG_LEVEL=debug
   ```

2. Run your command:

   ```bash
   npx promptfoo eval
   ```

3. Disable logging when done:

   ```bash
   unset PROMPTFOO_ENABLE_DATABASE_LOGS
   ```
