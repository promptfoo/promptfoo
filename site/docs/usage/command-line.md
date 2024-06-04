---
sidebar_position: 10
sidebar_label: Command line
---

# Command line

The `promptfoo` command line utility supports the following subcommands:

- `init [directory]` - Initialize a new project with dummy files.
- `eval` - Evaluate prompts and models. This is the command you'll be using the most!
- `view` - Start a browser UI for visualization of results.
- `share` - Create a URL that can be shared online.
- `cache` - Manage cache.
  - `cache clear`
- `list` - List various resources like evaluations, prompts, and datasets.
  - `list evals`
  - `list prompts`
  - `list datasets`
- `show <id>` - Show details of a specific resource (evaluation, prompt, dataset).
- `feedback <message>` - Send feedback to the Promptfoo developers.

## `promptfoo eval`

By default the `eval` command will read the `promptfooconfig.yaml` configuration file in your current directory. But, if you're looking to override certain parameters you can supply optional arguments:

| Option                              | Description                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-p, --prompts <paths...>`          | Paths to [prompt files](/docs/configuration/parameters#prompt-files), directory, or glob                                                                                                           |
| `-r, --providers <name or path...>` | [`openai:chat`][1], [`openai:completion`][1], [`localai:chat:<model-name>`][2], [`localai:completion:<model-name>`][2], or one of the many other permutations per [API providers](/docs/providers) |
| `-o, --output <paths...>`           | Path to [output file](/docs/configuration/parameters#output-file) (csv, json, yaml, html)                                                                                                          |
| `-t, --tests <path>`                | Path to [external test file](/docs/configuration/expected-outputs#load-an-external-tests-file)                                                                                                     |
| `-c, --config <path>`               | Path to one or more [configuration files](/docs/configuration/guide). `promptfooconfig.js/json/yaml` is automatically loaded if present. Wildcards and directories are supported.                  |
| `--grader`                          | [Provider](/docs/providers) that will conduct the evaluation, if you are [using LLM to grade your output](/docs/configuration/expected-outputs#llm-evaluation)                                     |
| `--repeat <number>`                 | Number of times to repeat each test case. Disables cache if >1                                                                                                                                     |
| `--delay <number>`                  | Force the test runner to wait after each API call (milliseconds)                                                                                                                                   |
| `--no-cache`                        | Disable cache                                                                                                                                                                                      |
| `--no-table`                        | Disable CLI table output                                                                                                                                                                           |
| `--no-progress-bar`                 | Disable the progress bar                                                                                                                                                                           |
| `--no-write`                        | Do not write the latest config to disk (used for web viewer and sharing)                                                                                                                           |
| `--prompt-prefix <path>`            | This prefix is prepended to every prompt                                                                                                                                                           |
| `--prompt-suffix <path>`            | This suffix is append to every prompt                                                                                                                                                              |
| `--share`                           | Automatically create a share link                                                                                                                                                                  |
| `--table-cell-max-length <number>`  | Truncate console table cells to this length                                                                                                                                                        |
| `--verbose`                         | Show debug logs                                                                                                                                                                                    |
| `--watch`                           | Watch the config and prompt files for changes                                                                                                                                                      |
| `-j, --max-concurrency <number>`    | Maximum number of concurrent API calls                                                                                                                                                             |
| `--env-file`                        | Path to env file (defaults to .env)                                                                                                                                                                |
| `--interactive-providers`           | Run 1 provider at a time and prompt user to continue                                                                                                                                               |
| `--filter-failing <path>`           | Run only failing tests from previous evaluation. Path to JSON output file from the previous evaluation.                                                                                            |
| `-n, --filter-first-n`              | Run the first N test cases                                                                                                                                                                         |
| `--filter-pattern <pattern>`        | Run only test cases whose `description` matches the regex pattern                                                                                                                                  |

[1]: /docs/providers/openai
[2]: /docs/providers/localai

The `eval` command will return exit code `100` when there is at least 1 test case failure. It will return exit code `1` for any other error. The exit code for failed tests can be overridden with environment variable `PROMPTFOO_FAILED_TEST_EXIT_CODE`.

## `promptfoo init [directory]`

Initialize a new project with dummy files.

| Option      | Description                  |
| ----------- | ---------------------------- |
| `directory` | Directory to create files in |

## `promptfoo view`

Start a browser UI for visualization of results.

| Option                | Description                             |
| --------------------- | --------------------------------------- |
| `-p, --port <number>` | Port number for the local server        |
| `-y, --yes`           | Skip confirmation and auto-open the URL |

If you've used `PROMPTFOO_CONFIG_DIR` to override the promptfoo output directory, run `promptfoo view [directory]`.

## `promptfoo share`

Create a URL that can be shared online.

| Option      | Description                                     |
| ----------- | ----------------------------------------------- |
| `-y, --yes` | Skip confirmation before creating shareable URL |

## `promptfoo cache`

Manage cache.

| Option  | Description     |
| ------- | --------------- |
| `clear` | Clear the cache |

## `promptfoo feedback <message>`

Send feedback to the promptfoo developers.

| Option    | Description      |
| --------- | ---------------- |
| `message` | Feedback message |

## `promptfoo list`

List various resources like evaluations, prompts, and datasets.

| Subcommand | Description      |
| ---------- | ---------------- |
| `evals`    | List evaluations |
| `prompts`  | List prompts     |
| `datasets` | List datasets    |

| Option | Description                                                     |
| ------ | --------------------------------------------------------------- |
| `-n`   | Show the first n records, sorted by descending date of creation |

## `promptfoo show <id>`

Show details of a specific resource.

| Option         | Description                           |
| -------------- | ------------------------------------- |
| `eval <id>`    | Show details of a specific evaluation |
| `prompt <id>`  | Show details of a specific prompt     |
| `dataset <id>` | Show details of a specific dataset    |

## `promptfoo import <filepath>`

Import an eval file from JSON format.

## `promptfoo export`

Export an eval record to JSON format. Outputs to stdout by default.

| Option                    | Description   |
| ------------------------- | ------------- |
| `-o, --output <filepath>` | File to write |

# Environment variables

These general-purpose environment variables are supported:

| Name                                   | Description                                                                                                                                      | Default        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY` | How many assertions to run at a time                                                                                                             | 3              |
| `PROMPTFOO_CONFIG_DIR`                 | Directory that stores eval history                                                                                                               | `~/.promptfoo` |
| `PROMPTFOO_DISABLE_CONVERSATION_VAR`   | Prevents the `_conversation` variable from being set                                                                                             |                |
| `PROMPTFOO_DISABLE_JSON_AUTOESCAPE`    | If set, disables smart variable substitution within JSON prompts                                                                                 |                |
| `PROMPTFOO_DISABLE_REF_PARSER`         | Prevents JSON schema dereferencing                                                                                                               |                |
| `PROMPTFOO_DISABLE_TEMPLATING`         | Disable Nunjucks rendering                                                                                                                       |                |
| `PROMPTFOO_DISABLE_VAR_EXPANSION`      | Prevents Array-type vars from being expanded into multiple test cases                                                                            |                |
| `PROMPTFOO_REQUIRE_JSON_PROMPTS`       | By default the chat completion provider will wrap non-JSON messages in a single user message. Setting this envar to true disables that behavior. |

:::tip
promptfoo will load environment variables from the `.env` in your current working directory.
:::

## `promptfoo generate dataset`

BETA: Generate synthetic test cases based on existing prompts and variables.

| Option                              | Description                                                | Default              |
| ----------------------------------- | ---------------------------------------------------------- | -------------------- |
| `-c, --config <path>`               | Path to the configuration file                             | promptfooconfig.yaml |
| `-w, --write`                       | Write the generated test cases directly to the config file | false                |
| `-i, --instructions <text>`         | Custom instructions for test case generation               |                      |
| `-o, --output <path>`               | Path to write the generated test cases                     | stdout               |
| `--numPersonas <number>`            | Number of personas to generate                             | 5                    |
| `--numTestCasesPerPersona <number>` | Number of test cases per persona                           | 3                    |

For example, this command will modify your default config file (usually `promptfooconfig.yaml`) with new test cases:

```
promptfoo generate dataset -w
```

This command will generate test cases for a specific config and write them to a file, while following special instructions:

```
promptfoo generate dataset -c my_config.yaml -o new_tests.yaml -i 'All test cases for {{location}} must be European cities'
```

:::info
While in beta, this feature depends on OpenAI and requires the `OPENAI_API_KEY` environment variable.
:::

## `promptfoo generate redteam`

BETA: Generate adversarial test cases to challenge your prompts and models.

| Option                  | Description                                                      | Default              |
| ----------------------- | ---------------------------------------------------------------- | -------------------- |
| `-c, --config <path>`   | Path to the configuration file                                   | promptfooconfig.yaml |
| `-o, --output <path>`   | Path to write the generated test cases                           | stdout               |
| `-w, --write`           | Write the generated test cases directly to the config file       | false                |
| `--purpose <purpose>`   | Set the system purpose. If not set, inferred from config         |                      |
| `--injectVar <varname>` | The name of the prompt variable that represents the user's input | `{{query}}`          |
| `--plugins <plugins>`   | Comma-separated list of plugins to enable                        | all plugins          |
| `--no-cache`            | Do not read or write results to disk cache                       | false                |
| `--env-file <path>`     | Path to .env file                                                |                      |

For example, let's suppose we have the following `promptfooconfig.yaml`:

```yaml
prompts:
  - 'Act as a trip planner and help the user plan their trip'

providers:
  - openai:gpt-3.5-turbo
  - openai:gpt-4o
```

This command will generate adversarial test cases and write them to the file:

```
promptfoo generate redteam -w
```

This command overrides the system purpose and the variable to inject adversarial user input:

```
promptfoo generate redteam -w --purpose 'Travel agent that helps users plan trips' --injectVar 'message'
```

:::danger
Adversarial testing produces offensive, toxic, and harmful test inputs, and may cause your system to produce harmful outputs.
:::

While in beta, this implementation requires `OPENAI_API_KEY` to be set.

## ASCII-only outputs

To disable terminal colors for printed outputs, set `FORCE_COLOR=0` (this is supported by the [chalk](https://github.com/chalk/chalk) library).

For the `eval` command, you may also want to disable the progress bar and table as well, because they use special characters:

```
FORCE_COLOR=0 promptfoo eval --no-progress-bar --no-table
```
