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
- `delete <id>` - Delete a resource by its ID (currently, just evaluations)
- `feedback <message>` - Send feedback to the Promptfoo developers.

## `promptfoo eval`

By default the `eval` command will read the `promptfooconfig.yaml` configuration file in your current directory. But, if you're looking to override certain parameters you can supply optional arguments:

| Option                              | Description                                                             |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `-a, --assertions <path>`           | Path to assertions file                                                 |
| `-c, --config <paths...>`           | Path to configuration file(s). Automatically loads promptfooconfig.yaml |
| `--delay <number>`                  | Delay between each test (in milliseconds)                               |
| `--description <description>`       | Description of the eval run                                             |
| `--env-file, --env-path <path>`     | Path to .env file                                                       |
| `--filter-failing <path>`           | Path to JSON output file with failing tests                             |
| `--filter-errors-only <path>`       | Path to JSON output file with error tests                               |
| `-n, --filter-first-n <number>`     | Only run the first N tests                                              |
| `--filter-sample <number>`          | Only run a random sample of N tests                                     |
| `--filter-metadata <key=value>`     | Only run tests whose metadata matches the key=value pair                |
| `--filter-pattern <pattern>`        | Only run tests whose description matches the regex pattern              |
| `--filter-providers <providers>`    | Only run tests with these providers                                     |
| `--filter-targets <targets>`        | Only run tests with these targets                                       |
| `--grader <provider>`               | Model that will grade outputs                                           |
| `-j, --max-concurrency <number>`    | Maximum number of concurrent API calls                                  |
| `--model-outputs <path>`            | Path to JSON containing list of LLM output strings                      |
| `--no-cache`                        | Do not read or write results to disk cache                              |
| `--no-progress-bar`                 | Do not show progress bar                                                |
| `--no-table`                        | Do not output table in CLI                                              |
| `--no-write`                        | Do not write results to promptfoo directory                             |
| `-o, --output <paths...>`           | Path(s) to output file (csv, txt, json, jsonl, yaml, yml, html)         |
| `-p, --prompts <paths...>`          | Paths to prompt files (.txt)                                            |
| `--prompt-prefix <path>`            | Prefix prepended to every prompt                                        |
| `--prompt-suffix <path>`            | Suffix appended to every prompt                                         |
| `-r, --providers <name or path...>` | Provider names or paths to custom API caller modules                    |
| `--remote`                          | Force remote inference wherever possible (used for red teams)           |
| `--repeat <number>`                 | Number of times to run each test                                        |
| `--share`                           | Create a shareable URL                                                  |
| `--suggest-prompts <number>`        | Generate N new prompts and append them to the prompt list               |
| `--table`                           | Output table in CLI                                                     |
| `--table-cell-max-length <number>`  | Truncate console table cells to this length                             |
| `-t, --tests <path>`                | Path to CSV with test cases                                             |
| `--var <key=value>`                 | Set a variable in key=value format                                      |
| `-v, --vars <path>`                 | Path to CSV with test cases (alias for --tests)                         |
| `--verbose`                         | Show debug logs                                                         |
| `-w, --watch`                       | Watch for changes in config and re-run                                  |

The `eval` command will return exit code `100` when there is at least 1 test case failure. It will return exit code `1` for any other error. The exit code for failed tests can be overridden with environment variable `PROMPTFOO_FAILED_TEST_EXIT_CODE`.

## `promptfoo init [directory]`

Initialize a new project with dummy files.

| Option             | Description                    |
| ------------------ | ------------------------------ |
| `directory`        | Directory to create files in   |
| `--no-interactive` | Do not run in interactive mode |

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

## `promptfoo delete <id>`

Deletes a specific resource.

| Option      | Description                |
| ----------- | -------------------------- |
| `eval <id>` | Delete an evaluation by id |

## `promptfoo import <filepath>`

Import an eval file from JSON format.

## `promptfoo export <evalId>`

Export an eval record to JSON format. To export the most recent, use evalId `latest`.

| Option                    | Description                                 |
| ------------------------- | ------------------------------------------- |
| `-o, --output <filepath>` | File to write. Writes to stdout by default. |

# Environment variables

These general-purpose environment variables are supported:

| Name                                   | Description                                                                                                                                      | Default        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `FORCE_COLOR`                          | Set to 0 to disable terminal colors for printed outputs                                                                                          |                |
| `PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY` | How many assertions to run at a time                                                                                                             | 3              |
| `PROMPTFOO_CONFIG_DIR`                 | Directory that stores eval history                                                                                                               | `~/.promptfoo` |
| `PROMPTFOO_DISABLE_AJV_STRICT_MODE`    | If set, disables AJV strict mode for JSON schema validation                                                                                      |                |
| `PROMPTFOO_DISABLE_CONVERSATION_VAR`   | Prevents the `_conversation` variable from being set                                                                                             |                |
| `PROMPTFOO_DISABLE_ERROR_LOG`          | Prevents error logs from being written to a file                                                                                                 |                |
| `PROMPTFOO_DISABLE_JSON_AUTOESCAPE`    | If set, disables smart variable substitution within JSON prompts                                                                                 |                |
| `PROMPTFOO_DISABLE_REF_PARSER`         | Prevents JSON schema dereferencing                                                                                                               |                |
| `PROMPTFOO_DISABLE_TEMPLATING`         | Disable Nunjucks rendering                                                                                                                       |                |
| `PROMPTFOO_DISABLE_VAR_EXPANSION`      | Prevents Array-type vars from being expanded into multiple test cases                                                                            |                |
| `PROMPTFOO_FAILED_TEST_EXIT_CODE`      | Override the exit code when there is at least 1 test case failure or when the pass rate is below PROMPTFOO_PASS_RATE_THRESHOLD                   | 100            |
| `PROMPTFOO_LOG_DIR`                    | Directory to write error logs                                                                                                                    | `.`            |
| `PROMPTFOO_PASS_RATE_THRESHOLD`        | Set a minimum pass rate threshold (as a percentage). If not set, defaults to 0 failures                                                          | 0              |
| `PROMPTFOO_REQUIRE_JSON_PROMPTS`       | By default the chat completion provider will wrap non-JSON messages in a single user message. Setting this envar to true disables that behavior. |                |
| `PROMPTFOO_STRIP_PROMPT_TEXT`          | Strip prompt text from results to reduce memory usage                                                                                            | false          |
| `PROMPTFOO_STRIP_RESPONSE_OUTPUT`      | Strip model response outputs from results to reduce memory usage                                                                                 | false          |
| `PROMPTFOO_STRIP_TEST_VARS`            | Strip test variables from results to reduce memory usage                                                                                         | false          |
| `PROMPTFOO_STRIP_GRADING_RESULT`       | Strip grading results from results to reduce memory usage                                                                                        | false          |
| `PROMPTFOO_STRIP_METADATA`             | Strip metadata from results to reduce memory usage                                                                                               | false          |
| `PROMPTFOO_SHARE_CHUNK_SIZE`           | Number of results to send in each chunk. This is used to estimate the size of the results and to determine the number of chunks to send.         |                |

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

```sh
promptfoo generate dataset -w
```

This command will generate test cases for a specific config and write them to a file, while following special instructions:

```sh
promptfoo generate dataset -c my_config.yaml -o new_tests.yaml -i 'All test cases for {{location}} must be European cities'
```

## `promptfoo redteam init`

Initialize a red teaming project.

| Option        | Description                            | Default |
| ------------- | -------------------------------------- | ------- |
| `[directory]` | Directory to initialize the project in | .       |
| `--no-gui`    | Do not open the browser UI             |         |

Example:

```sh
promptfoo redteam init my_project
```

:::danger
Adversarial testing produces offensive, toxic, and harmful test inputs, and may cause your system to produce harmful outputs.
:::

For more detail, see [red team configuration](/docs/red-team/configuration/).

## `promptfoo redteam setup`

Start browser UI and open to red team setup.

| Option                           | Description                                     | Default |
| -------------------------------- | ----------------------------------------------- | ------- |
| `[configDirectory]`              | Directory containing configuration files        |         |
| `-p, --port <number>`            | Port number for the local server                | 15500   |
| `--filter-description <pattern>` | Filter evals by description using regex pattern |         |
| `--env-file, --env-path <path>`  | Path to .env file                               |         |

## `promptfoo redteam run`

Run the complete red teaming process (init, generate, and evaluate).

| Option                           | Description                                      | Default              |
| -------------------------------- | ------------------------------------------------ | -------------------- |
| `-c, --config [path]`            | Path to configuration file                       | promptfooconfig.yaml |
| `-o, --output [path]`            | Path to output file for generated tests          | redteam.yaml         |
| `--no-cache`                     | Do not read or write results to disk cache       | false                |
| `--env-file, --env-path <path>`  | Path to .env file                                |                      |
| `-j, --max-concurrency <number>` | Maximum number of concurrent API calls           |                      |
| `--delay <number>`               | Delay in milliseconds between API calls          |                      |
| `--remote`                       | Force remote inference wherever possible         | false                |
| `--force`                        | Force generation even if no changes are detected | false                |

Example:

```sh
promptfoo redteam run -c custom_config.yaml -o custom_output.yaml
```

## `promptfoo redteam generate`

Generate adversarial test cases to challenge your prompts and models.

| Option                           | Description                                                          | Default              |
| -------------------------------- | -------------------------------------------------------------------- | -------------------- |
| `-c, --config <path>`            | Path to configuration file                                           | promptfooconfig.yaml |
| `-o, --output <path>`            | Path to write the generated test cases                               | redteam.yaml         |
| `-w, --write`                    | Write the generated test cases directly to the config file           | false                |
| `--purpose <purpose>`            | High-level description of the system's purpose                       | Inferred from config |
| `--provider <provider>`          | Provider to use for generating adversarial tests                     |                      |
| `--injectVar <varname>`          | Override the `{{variable}}` that represents user input in the prompt | `prompt`             |
| `--plugins <plugins>`            | Comma-separated list of plugins to use                               | default              |
| `--strategies <strategies>`      | Comma-separated list of strategies to use                            | default              |
| `-n, --num-tests <number>`       | Number of test cases to generate per plugin                          |                      |
| `--language <language>`          | Specify the language for generated tests                             | English              |
| `--no-cache`                     | Do not read or write results to disk cache                           | false                |
| `--env-file, --env-path <path>`  | Path to .env file                                                    |                      |
| `-j, --max-concurrency <number>` | Maximum number of concurrent API calls                               |                      |
| `--delay <number>`               | Delay in milliseconds between plugin API calls                       |                      |
| `--remote`                       | Force remote inference wherever possible                             | false                |
| `--force`                        | Force generation even if no changes are detected                     | false                |
| `--burp-escape-json`             | Escape special characters in .burp output for JSON payloads          | false                |

For example, let's suppose we have the following `promptfooconfig.yaml`:

```yaml
prompts:
  - 'Act as a trip planner and help the user plan their trip'

providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o
```

This command will generate adversarial test cases and write them to `redteam.yaml`.

```sh
promptfoo redteam generate
```

This command overrides the system purpose and the variable to inject adversarial user input:

```sh
promptfoo redteam generate --purpose 'Travel agent that helps users plan trips' --injectVar 'message'
```

## `promptfoo redteam eval`

Works the same as [`promptfoo eval`](#promptfoo-eval), but defaults to loading `redteam.yaml`.

## `promptfoo redteam report`

Start a browser UI and open the red teaming report.

| Option                           | Description                                        | Default |
| -------------------------------- | -------------------------------------------------- | ------- |
| `[directory]`                    | Directory containing the red teaming configuration | .       |
| `-p, --port <number>`            | Port number for the server                         | 15500   |
| `--filter-description <pattern>` | Filter evals by description using a regex pattern  |         |
| `--env-file, --env-path <path>`  | Path to .env file                                  |         |

Example:

```sh
promptfoo redteam report -p 8080
```

## ASCII-only outputs

To disable terminal colors for printed outputs, set `FORCE_COLOR=0` (this is supported by the [chalk](https://github.com/chalk/chalk) library).

For the `eval` command, you may also want to disable the progress bar and table as well, because they use special characters:

```sh
FORCE_COLOR=0 promptfoo eval --no-progress-bar --no-table
```
