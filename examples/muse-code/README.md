# muse-code (Muse Code)

Evaluate Meta's Muse Code coding agent on the included JavaScript workspace. The agent reads a file and identifies the function that answers each question.

## Setup

1. Install [Muse Code](https://dev.meta.ai/docs/muse-code) 1.0.2 or later on macOS or Linux.
2. Set `META_API_KEY` or sign in through `muse`.
3. Initialize this example:

   ```bash
   npx promptfoo@latest init --example muse-code
   cd muse-code
   ```

4. Run the eval:

   ```bash
   npx promptfoo@latest eval --no-cache
   ```

`working_dir` resolves relative to `promptfooconfig.yaml`. This example disables shell execution, file writes, web tools, and foreign personal context. Each test uses a new session. Set `model` to compare a specific Muse model, or omit it to use the CLI default.

For a nonstandard installation, set `MUSE_CLI_PATH` to the executable path. See the [provider documentation](https://www.promptfoo.dev/docs/providers/muse-code/) for permission controls, session reuse, and result metadata.
