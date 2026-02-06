---
sidebar_position: 10
sidebar_label: Command line
description: Explore promptfoo CLI commands for LLM testing - run evaluations, generate datasets, scan models for vulnerabilities, and automate testing workflows via command line
---

# Command line

The `promptfoo` command line utility supports the following subcommands:

- `init [directory]` - Initialize a new project with dummy files.
- `eval` - Evaluate prompts and models. This is the command you'll be using the most!
- `view` - Start a browser UI for visualization of results.
- `share` - Create a URL that can be shared online.
- `auth` - Manage authentication for cloud features.
- `cache` - Manage cache.
  - `cache clear`
- `config` - Edit configuration settings.
  - `config get`
  - `config set`
  - `config unset`
- `debug` - Display debug information for troubleshooting.
- `generate` - Generate data.
  - `generate dataset`
  - `generate redteam`
  - `generate assertions`
- `list` - List various resources like evaluations, prompts, and datasets.
  - `list evals`
  - `list prompts`
  - `list datasets`
- `logs` - View promptfoo log files.
  - `logs [file]`
  - `logs list`
- `mcp` - Start a Model Context Protocol (MCP) server to expose promptfoo tools to AI agents and development environments.
- `scan-model` - Scan ML models for security vulnerabilities.
- `show <id>` - Show details of a specific resource (evaluation, prompt, dataset).
- `delete <id>` - Delete a resource by its ID (currently, just evaluations)
- `validate` - Validate a promptfoo configuration file.
- `feedback <message>` - Send feedback to the Promptfoo developers.
- `import <filepath>` - Import an eval file from JSON format.
- `export` - Export eval records or logs.
  - `export eval <evalId>`
  - `export logs`
- `redteam` - Red team LLM applications.
  - `redteam init`
  - `redteam setup`
  - `redteam run`
  - `redteam discover`
  - `redteam generate`
  - `redteam poison`
  - `redteam eval`
  - `redteam report`
  - `redteam plugins`

## Common Options

Most commands support the following common options:

| Option                              | Description                                       |
| ----------------------------------- | ------------------------------------------------- |
| `--env-file, --env-path <paths...>` | Path(s) to .env file(s). Supports multiple files. |
| `-v, --verbose`                     | Show debug logs                                   |
| `--help`                            | Display help                                      |

### Multiple Environment Files

You can load multiple `.env` files. Later files override values from earlier ones:

```bash
# Space-separated
promptfoo eval --env-file .env .env.local

# Repeated flags
promptfoo eval --env-file .env --env-file .env.local
```

All specified files must exist or an error is thrown.

## `promptfoo eval`

By default the `eval` command will read the `promptfooconfig.yaml` configuration file in your current directory. But, if you're looking to override certain parameters you can supply optional arguments:

| Option                              | Description                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `-a, --assertions <path>`           | Path to assertions file                                                                                  |
| `-c, --config <paths...>`           | Path to configuration file(s). Automatically loads promptfooconfig.yaml                                  |
| `--delay <number>`                  | Delay between each test (in milliseconds)                                                                |
| `--description <description>`       | Description of the eval run                                                                              |
| `--filter-failing <path or id>`     | Filter tests that failed in a previous evaluation (by file path or eval ID)                              |
| `--filter-errors-only <path or id>` | Filter tests that resulted in errors in a previous evaluation                                            |
| `-n, --filter-first-n <number>`     | Only run the first N tests                                                                               |
| `--filter-sample <number>`          | Only run a random sample of N tests                                                                      |
| `--filter-metadata <key=value>`     | Only run tests whose metadata matches the key=value pair. Can be specified multiple times for AND logic. |
| `--filter-pattern <pattern>`        | Only run tests whose description matches the regex pattern                                               |
| `--filter-providers <providers>`    | Only run tests with these providers (regex match on provider `id` or `label`)                            |
| `--filter-targets <targets>`        | Only run tests with these targets (alias for --filter-providers)                                         |
| `--grader <provider>`               | Model that will grade outputs                                                                            |
| `-j, --max-concurrency <number>`    | Maximum number of concurrent API calls                                                                   |
| `--model-outputs <path>`            | Path to JSON containing list of LLM output strings                                                       |
| `--no-cache`                        | Do not read or write results to disk cache                                                               |
| `--no-progress-bar`                 | Do not show progress bar                                                                                 |
| `--no-table`                        | Do not output table in CLI                                                                               |
| `--no-write`                        | Do not write results to promptfoo directory                                                              |
| `--resume [evalId]`                 | Resume a paused/incomplete evaluation. If `evalId` is omitted, resumes latest                            |
| `--retry-errors`                    | Retry all ERROR results from the latest evaluation                                                       |
| `-o, --output <paths...>`           | Path(s) to output file (csv, txt, json, jsonl, yaml, yml, html, xml)                                     |
| `-p, --prompts <paths...>`          | Paths to prompt files (.txt)                                                                             |
| `--prompt-prefix <path>`            | Prefix prepended to every prompt                                                                         |
| `--prompt-suffix <path>`            | Suffix appended to every prompt                                                                          |
| `-r, --providers <name or path...>` | Provider names or paths to custom API caller modules                                                     |
| `--remote`                          | Force remote inference wherever possible (used for red teams)                                            |
| `--repeat <number>`                 | Number of times to run each test                                                                         |
| `--share`                           | Create a shareable URL                                                                                   |
| `--no-share`                        | Do not create a shareable URL, this overrides the config file                                            |
| `--suggest-prompts <number>`        | Generate N new prompts and append them to the prompt list                                                |
| `--table`                           | Output table in CLI                                                                                      |
| `--table-cell-max-length <number>`  | Truncate console table cells to this length                                                              |
| `-t, --tests <path>`                | Path to CSV with test cases                                                                              |
| `--var <key=value>`                 | Set a variable in key=value format                                                                       |
| `-v, --vars <path>`                 | Path to CSV with test cases (alias for --tests)                                                          |
| `-w, --watch`                       | Watch for changes in config and re-run                                                                   |

The `eval` command will return exit code `100` when there is at least 1 test case failure or when the pass rate is below the threshold set by `PROMPTFOO_PASS_RATE_THRESHOLD`. It will return exit code `1` for any other error. The exit code for failed tests can be overridden with environment variable `PROMPTFOO_FAILED_TEST_EXIT_CODE`.

### Pause and Resume

```sh
promptfoo eval --resume            # resumes the latest evaluation
promptfoo eval --resume <evalId>   # resumes a specific evaluation
```

- On resume, promptfoo reuses the original run's effective runtime options (e.g., `--delay`, `--no-cache`, `--max-concurrency`, `--repeat`), skips completed test/prompt pairs, ignores CLI flags that change test ordering to keep indices aligned, and disables watch mode.

### Retry Errors

```sh
promptfoo eval --retry-errors      # retries all ERROR results from the latest eval
```

- The retry errors feature automatically finds ERROR results from the latest eval and re-runs only those test cases. This is useful when evals fail due to temporary network issues, rate limits, or API errors.
- **Data safety**: If the retry fails, your original ERROR results are preserved. Old ERROR results are only removed after the retry succeeds. You can safely run `--retry-errors` again if it fails.
- Cannot be used together with `--resume` or `--no-write` flags.
- Uses the original eval's configuration and runtime options to ensure consistency.

## `promptfoo init [directory]`

Initialize a new project with dummy files.

| Option             | Description                    |
| ------------------ | ------------------------------ |
| `directory`        | Directory to create files in   |
| `--no-interactive` | Do not run in interactive mode |

## `promptfoo view`

Start a browser UI for visualization of results.

| Option                | Description                               |
| --------------------- | ----------------------------------------- |
| `-p, --port <number>` | Port number for the local server          |
| `-y, --yes`           | Skip confirmation and auto-open the URL   |
| `-n, --no`            | Skip confirmation and do not open the URL |

If you've used `PROMPTFOO_CONFIG_DIR` to override the promptfoo output directory, run `promptfoo view [directory]`.

## `promptfoo share [evalId]`

Create a URL that can be shared online.

| Option        | Description                         |
| ------------- | ----------------------------------- |
| `--show-auth` | Include auth info in the shared URL |

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

| Option       | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `-n`         | Show the first n records, sorted by descending date of creation |
| `--ids-only` | Show only IDs without descriptions                              |

## `promptfoo logs`

View promptfoo log files directly from the command line.

| Option                 | Description                                | Default |
| ---------------------- | ------------------------------------------ | ------- |
| `[file]`               | Log file to view (name, path, or partial)  | latest  |
| `--type <type>`        | Log type: `debug`, `error`, or `all`       | `all`   |
| `-n, --lines <num>`    | Number of lines to display from end (tail) |         |
| `--head <num>`         | Number of lines to display from start      |         |
| `-f, --follow`         | Follow log file in real-time               | `false` |
| `-l, --list`           | List available log files                   | `false` |
| `-g, --grep <pattern>` | Filter lines matching pattern (regex)      |         |
| `--no-color`           | Disable syntax highlighting                |         |

### `promptfoo logs list`

List available log files in the logs directory.

| Option          | Description                          | Default |
| --------------- | ------------------------------------ | ------- |
| `--type <type>` | Log type: `debug`, `error`, or `all` | `all`   |

### Examples

```sh
# View most recent log file (or current session's log if run during a CLI session)
promptfoo logs

# View last 50 lines
promptfoo logs -n 50

# View first 20 lines
promptfoo logs --head 20

# Follow log in real-time (like tail -f)
promptfoo logs -f

# List all available log files
promptfoo logs --list

# View a specific log file by name or partial match
promptfoo logs promptfoo-debug-2024-01-15_10-30-00.log
promptfoo logs 2024-01-15

# View error logs only
promptfoo logs --type error

# Filter logs by pattern (case-insensitive regex)
promptfoo logs --grep "error|warn"
promptfoo logs --grep "openai"
```

Log files are stored in `~/.promptfoo/logs` by default. Set `PROMPTFOO_LOG_DIR` to use a custom directory.

## `promptfoo mcp`

Start a Model Context Protocol (MCP) server to expose promptfoo's eval and testing capabilities as tools that AI agents and development environments can use.

| Option                | Description                       | Default |
| --------------------- | --------------------------------- | ------- |
| `-p, --port <number>` | Port number for HTTP transport    | 3100    |
| `--transport <type>`  | Transport type: "http" or "stdio" | http    |

### Transport Types

- **STDIO**: Best for desktop AI tools like Cursor, Claude Desktop, and local AI agents that communicate via standard input/output
- **HTTP**: Best for web applications, APIs, and remote integrations that need HTTP endpoints

### Examples

```sh
# Start MCP server with STDIO transport (for Cursor, Claude Desktop, etc.)
npx promptfoo@latest mcp --transport stdio

# Start MCP server with HTTP transport on default port
npx promptfoo@latest mcp --transport http

# Start MCP server with HTTP transport on custom port
npx promptfoo@latest mcp --transport http --port 8080
```

### Available Tools

The MCP server provides 9 tools for AI agents:

**Core Evaluation Tools:**

- **`list_evaluations`** - Browse your evaluation runs with optional dataset filtering
- **`get_evaluation_details`** - Get comprehensive results, metrics, and test cases for a specific evaluation
- **`run_evaluation`** - Execute evaluations with custom parameters, test case filtering, and concurrency control
- **`share_evaluation`** - Generate publicly shareable URLs for evaluation results

**Redteam Security Tools:**

- **`redteam_run`** - Execute comprehensive security testing against AI applications with dynamic attack probes
- **`redteam_generate`** - Generate adversarial test cases for redteam security testing with configurable plugins and strategies

**Configuration & Testing:**

- **`validate_promptfoo_config`** - Validate configuration files using the same logic as the CLI
- **`test_provider`** - Test AI provider connectivity, credentials, and response quality
- **`run_assertion`** - Test individual assertion rules against outputs for debugging

For detailed setup instructions and integration examples, see the [MCP Server documentation](/docs/integrations/mcp-server).

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

## `promptfoo retry <evalId>`

Retry all ERROR results from a specific eval. This command finds test cases that resulted in errors (e.g., from network issues, rate limits, or API failures) and re-runs only those test cases. The results are updated in place in the original eval.

| Option                       | Description                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `-c, --config <path>`        | Path to configuration file (optional, uses original eval config if not provided)       |
| `-v, --verbose`              | Verbose output                                                                         |
| `--max-concurrency <number>` | Maximum number of concurrent evals                                                     |
| `--delay <number>`           | Delay between evals in milliseconds                                                    |
| `--share/--no-share`         | Share results to cloud (auto-shares when cloud is configured, disable with --no-share) |

Examples:

```sh
# Retry errors from a specific eval
promptfoo retry eval-abc123

# Retry with a different config file
promptfoo retry eval-abc123 -c updated-config.yaml

# Retry with verbose output and limited concurrency
promptfoo retry eval-abc123 -v --max-concurrency 2

# Retry and share results to cloud
promptfoo retry eval-abc123 --share
```

:::tip Data Safety
If the retry operation fails (network error, API timeout, etc.), your original ERROR results are preserved. You can simply run the retry command again to continue. Old ERROR results are only removed after the retry succeeds.
:::

:::tip
Unlike `--filter-errors-only` which creates a new evaluation, `promptfoo retry` updates the original evaluation in place. Use `retry` when you want to fix errors in an existing eval without creating duplicates.
:::

## `promptfoo import <filepath>`

Import an eval file from JSON format.

| Option     | Description                                                                          |
| ---------- | ------------------------------------------------------------------------------------ |
| `--new-id` | Generate a new eval ID instead of preserving the original (creates a duplicate eval) |
| `--force`  | Replace an existing eval with the same ID                                            |

When importing an eval, the following data is preserved from the export:

- **Eval ID** - Preserved by default. Use `--new-id` to generate a new ID, or `--force` to replace an existing eval.
- **Timestamp** - The original creation timestamp is always preserved (even with `--new-id` or `--force`)
- **Author** - The original author is always preserved (even with `--new-id` or `--force`)
- **Config, results, and all test data** - Fully preserved

If an eval with the same ID already exists, the import will fail with an error unless you specify `--new-id` (to create a duplicate with a new ID) or `--force` (to replace the existing eval).

Example:

```sh
# Import an eval, preserving the original ID
promptfoo import my-eval.json

# Import even if an eval with this ID exists (creates duplicate with new ID)
promptfoo import --new-id my-eval.json

# Replace an existing eval with updated data
promptfoo import --force my-eval.json
```

## `promptfoo export`

Export eval records or logs.

### `promptfoo export eval <evalId>`

Export an eval record to JSON format. To export the most recent, use evalId `latest`.

| Option                    | Description                                 |
| ------------------------- | ------------------------------------------- |
| `-o, --output <filepath>` | File to write. Writes to stdout by default. |

### `promptfoo export logs`

Collect and zip log files for debugging purposes.

| Option                    | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `-n, --count <number>`    | Number of recent log files to include (default: all) |
| `-o, --output <filepath>` | Output path for the compressed log file              |

This command creates a compressed tar.gz archive containing your promptfoo log files, making it easy to share them for debugging purposes. If no output path is specified, it will generate a timestamped filename automatically.

Log files are stored in `~/.promptfoo/logs` by default. To use a custom log directory, set the `PROMPTFOO_LOG_DIR` environment variable.

## `promptfoo validate`

Validate a promptfoo configuration file to ensure it follows the correct schema and structure.

| Option                    | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `-c, --config <paths...>` | Path to configuration file(s). Automatically loads promptfooconfig.yaml |

This command validates both the configuration file and the test suite to ensure they conform to the expected schema. It will report any validation errors with detailed messages to help you fix configuration issues.

Examples:

```sh
# Validate the default promptfooconfig.yaml
promptfoo validate

# Validate a specific configuration file
promptfoo validate -c my-config.yaml

# Validate multiple configuration files
promptfoo validate -c config1.yaml config2.yaml
```

The command will exit with code `1` if validation fails, making it useful for CI/CD pipelines to catch configuration errors early.

## `promptfoo scan-model`

Scan ML models for security vulnerabilities. Provide one or more paths to model files or directories.

| Option                         | Description                                                                                                              | Default |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| `-b, --blacklist <pattern>`    | Additional blacklist patterns to check against model names                                                               |         |
| `-f, --format <format>`        | Output format (`text`, `json`, or `sarif`)                                                                               | `text`  |
| `-o, --output <path>`          | Output file path (prints to stdout if not specified)                                                                     |         |
| `-t, --timeout <seconds>`      | Scan timeout in seconds                                                                                                  | `300`   |
| `--max-size <size>`            | Override auto-detected size limits (e.g., `10GB`, `500MB`)                                                               |         |
| `--include-scanner <scanners>` | Include specific scanners to run (adds to default scanner set)                                                           |         |
| `--exclude-scanner <scanners>` | Exclude specific scanners from running (removes from default scanner set)                                                |         |
| `--profile <profile>`          | Use a predefined scanner profile (`quick-scan`, `serialization-attacks`, `format-integrity`, `archive-inspection`, etc.) |         |
| `--strict`                     | Strict mode: fail on warnings, scan all file types, strict license validation                                            |         |
| `--dry-run`                    | Preview what would be scanned/downloaded without actually doing it                                                       |         |
| `--no-cache`                   | Force disable caching                                                                                                    |         |
| `--quiet`                      | Silence detection messages                                                                                               |         |
| `--progress`                   | Force enable progress reporting                                                                                          |         |
| `--stream`                     | Scan and delete downloaded files immediately after scan                                                                  |         |
| `--sbom <path>`                | Write CycloneDX SBOM to the specified file                                                                               |         |
| `--no-write`                   | Do not write results to database                                                                                         |         |
| `--name <name>`                | Name for the audit (when saving to database)                                                                             |         |
| `--force`                      | Force scan even if model was already scanned                                                                             |         |
| `--share`                      | Share the model audit results                                                                                            |         |
| `--no-share`                   | Do not share the model audit results                                                                                     |         |
| `-v, --verbose`                | Enable verbose output                                                                                                    |         |

See the [ModelAudit documentation](/docs/model-audit/) for comprehensive usage examples, scanner selection details, and CI/CD integration guides.

## `promptfoo auth`

Manage authentication for cloud features.

### `promptfoo auth login`

Login to the promptfoo cloud.

| Option                | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `-o, --org <orgId>`   | The organization ID to log in to                                           |
| `-h, --host <host>`   | The host of the promptfoo instance (API URL if different from the app URL) |
| `-k, --api-key <key>` | Log in using an API key                                                    |

After login, if you have multiple teams, you can switch between them using the `teams` subcommand.

### `promptfoo auth logout`

Logout from the promptfoo cloud.

### `promptfoo auth whoami`

Display current authentication status including user, organization, and active team.

**Output includes:**

- User email
- Organization name
- Current team (if logged in to a multi-team organization)
- App URL

Example:

```sh
promptfoo auth whoami
```

Output:

```
Currently logged in as:
User: user@company.com
Organization: Acme Corp
Current Team: Engineering Team
App URL: https://www.promptfoo.app
```

### `promptfoo auth teams`

Manage team switching for organizations with multiple teams.

#### `promptfoo auth teams list`

List all teams you have access to in the current organization.

#### `promptfoo auth teams current`

Show the currently active team.

#### `promptfoo auth teams set <teamIdentifier>`

Switch to a specific team. The team identifier can be:

- Team name (e.g., "Engineering")
- Team slug (e.g., "engineering")
- Team ID (e.g., "team_12345")

Examples:

```sh
# Switch to team by name
promptfoo auth teams set "Engineering Team"

# Switch to team by slug
promptfoo auth teams set engineering

# Switch to team by ID
promptfoo auth teams set team_12345
```

Your team selection is remembered across CLI sessions and applies to all promptfoo operations including evaluations and red team testing.

#### Team Selection Across Organizations

If you have access to multiple organizations, team selections are **isolated per organization**. This means:

- Each organization remembers its own team selection
- Switching between organizations preserves your team choice in each org
- When you log into an organization, your previously selected team is automatically restored

Example workflow:

```sh
# Login to Organization A
promptfoo auth login --api-key <org-a-key>
promptfoo auth teams set "Engineering"     # Set team in Org A

# Login to Organization B
promptfoo auth login --api-key <org-b-key>
promptfoo auth teams set "Marketing"       # Set team in Org B

# Login back to Organization A
promptfoo auth login --api-key <org-a-key>
promptfoo auth teams current              # Shows "Engineering" (preserved!)
```

Your team selection persists across login sessions within the same organization.

## `promptfoo config`

Edit configuration settings.

### `promptfoo config get email`

Get the user's email address.

### `promptfoo config set email <email>`

Set the user's email address.

### `promptfoo config unset email`

Unset the user's email address.

| Option        | Description                      |
| ------------- | -------------------------------- |
| `-f, --force` | Force unset without confirmation |

## `promptfoo debug`

Display debug information for troubleshooting.

| Option                | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| `-c, --config [path]` | Path to configuration file. Defaults to promptfooconfig.yaml |

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
| `--provider <provider>`             | Provider to use for generating test cases                  | default grader       |
| `--no-cache`                        | Do not read or write results to disk cache                 | false                |

For example, this command will modify your default config file (usually `promptfooconfig.yaml`) with new test cases:

```sh
promptfoo generate dataset -w
```

This command will generate test cases for a specific config and write them to a file, while following special instructions:

```sh
promptfoo generate dataset -c my_config.yaml -o new_tests.yaml -i 'All test cases for {{location}} must be European cities'
```

## `promptfoo generate assertions`

Generate additional objective/subjective assertions based on existing prompts and assertions.

- This command can be used to generate initial set of assertions, if none exist.
- Will only add non-overlapping, independent assertions
- Generates both python and natural language assertions.

When brainstorming assertions:

- Generates python code for any objective assertions
- Uses a specified natural language assertion type (pi, llm-rubric, or g-eval) for any subjective assertion.

| Option                      | Description                                                     | Default              |
| --------------------------- | --------------------------------------------------------------- | -------------------- |
| `-t, --type <type>`         | The assertion type to use for generated subjective assertions.  | pi                   |
| `-c, --config <path>`       | Path to the configuration file that contains at least 1 prompt. | promptfooconfig.yaml |
| `-w, --write`               | Write the generated assertions directly to the config file      | false                |
| `-i, --instructions <text>` | Custom instructions for assertion generation                    |                      |
| `-o, --output <path>`       | Path to write the generated assertions                          | stdout               |
| `--numAssertions <number>`  | Number of assertions to generate                                | 5                    |
| `--provider <provider>`     | Provider to use for generating assertions                       | default grader       |
| `--no-cache`                | Do not read or write results to disk cache                      | false                |

For example, this command will modify your default config file (usually `promptfooconfig.yaml`) with new test cases:

```sh
promptfoo generate assertions -w
```

This command will generate `pi` and `python` assertions for a specific config and write them to a file, while following special instructions:

```sh
promptfoo generate assertions -c my_config.yaml -o new_tests.yaml -i 'I need assertions about pronunciation'
```

## `promptfoo generate redteam`

Alias for [`promptfoo redteam generate`](#promptfoo-redteam-generate).

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

| Option                | Description                              | Default |
| --------------------- | ---------------------------------------- | ------- |
| `[configDirectory]`   | Directory containing configuration files |         |
| `-p, --port <number>` | Port number for the local server         | 15500   |

## `promptfoo redteam run`

Run the complete red teaming process (init, generate, and evaluate).

| Option                                             | Description                                       | Default              |
| -------------------------------------------------- | ------------------------------------------------- | -------------------- |
| `-c, --config [path]`                              | Path to configuration file                        | promptfooconfig.yaml |
| `-o, --output [path]`                              | Path to output file for generated tests           | redteam.yaml         |
| `-d, --description <text>`                         | Custom description/name for this scan run         |                      |
| `--no-cache`                                       | Do not read or write results to disk cache        | false                |
| `-j, --max-concurrency <number>`                   | Maximum number of concurrent API calls            |                      |
| `--delay <number>`                                 | Delay in milliseconds between API calls           |                      |
| `--remote`                                         | Force remote inference wherever possible          | false                |
| `--force`                                          | Force generation even if no changes are detected  | false                |
| `--no-progress-bar`                                | Do not show progress bar                          |                      |
| `--strict`                                         | Fail if any plugins fail to generate test cases   | false                |
| `--filter-providers, --filter-targets <providers>` | Only run tests with these providers (regex match) |                      |
| `-t, --target <id>`                                | Cloud provider target ID to run the scan on       |                      |

## `promptfoo redteam discover`

Runs the [Target Discovery Agent](/docs/red-team/discovery) against your application.

:::info

Only a configuration file or target can be specified

:::

| Option                | Description                                          | Default |
| --------------------- | ---------------------------------------------------- | ------- |
| `-c, --config <path>` | Path to `promptfooconfig.yaml` configuration file.   |         |
| `-t, --target <id>`   | UUID of a target defined in Promptfoo Cloud to scan. |         |

## `promptfoo redteam generate`

Generate adversarial test cases to challenge your prompts and models.

| Option                           | Description                                                          | Default              |
| -------------------------------- | -------------------------------------------------------------------- | -------------------- |
| `-c, --config <path>`            | Path to configuration file                                           | promptfooconfig.yaml |
| `-o, --output <path>`            | Path to write the generated test cases                               | redteam.yaml         |
| `-d, --description <text>`       | Custom description/name for the generated tests                      |                      |
| `-w, --write`                    | Write the generated test cases directly to the config file           | false                |
| `-t, --target <id>`              | Cloud provider target ID to run the scan on                          |                      |
| `--purpose <purpose>`            | High-level description of the system's purpose                       | Inferred from config |
| `--provider <provider>`          | Provider to use for generating adversarial tests                     |                      |
| `--injectVar <varname>`          | Override the `{{variable}}` that represents user input in the prompt | `prompt`             |
| `--plugins <plugins>`            | Comma-separated list of plugins to use                               | default              |
| `--strategies <strategies>`      | Comma-separated list of strategies to use                            | default              |
| `-n, --num-tests <number>`       | Number of test cases to generate per plugin                          |                      |
| `--language <language>`          | Specify the language for generated tests                             | English              |
| `--no-cache`                     | Do not read or write results to disk cache                           | false                |
| `-j, --max-concurrency <number>` | Maximum number of concurrent API calls                               |                      |
| `--delay <number>`               | Delay in milliseconds between plugin API calls                       |                      |
| `--remote`                       | Force remote inference wherever possible                             | false                |
| `--force`                        | Force generation even if no changes are detected                     | false                |
| `--no-progress-bar`              | Do not show progress bar                                             |                      |
| `--strict`                       | Fail if any plugins fail to generate test cases                      | false                |
| `--burp-escape-json`             | Escape special characters in .burp output for JSON payloads          | false                |

For example, let's suppose we have the following `promptfooconfig.yaml`:

```yaml
prompts:
  - 'Act as a trip planner and help the user plan their trip'

providers:
  - openai:gpt-5-mini
  - openai:gpt-5
```

This command will generate adversarial test cases and write them to `redteam.yaml`.

```sh
promptfoo redteam generate
```

This command overrides the system purpose and the variable to inject adversarial user input:

```sh
promptfoo redteam generate --purpose 'Travel agent that helps users plan trips' --injectVar 'message'
```

## `promptfoo redteam poison`

Generate poisoned documents for RAG testing.

| Option                    | Description                                       | Default                |
| ------------------------- | ------------------------------------------------- | ---------------------- |
| `documents`               | Documents, directories, or text content to poison |                        |
| `-g, --goal <goal>`       | Goal/intended result of the poisoning             |                        |
| `-o, --output <path>`     | Output YAML file path                             | `poisoned-config.yaml` |
| `-d, --output-dir <path>` | Directory to write individual poisoned documents  | `poisoned-documents`   |

## `promptfoo redteam eval`

Works the same as [`promptfoo eval`](#promptfoo-eval), but defaults to loading `redteam.yaml`.

## `promptfoo redteam report`

Start a browser UI and open the red teaming report.

| Option                | Description                                        | Default |
| --------------------- | -------------------------------------------------- | ------- |
| `[directory]`         | Directory containing the red teaming configuration | .       |
| `-p, --port <number>` | Port number for the server                         | 15500   |

Example:

```sh
promptfoo redteam report -p 8080
```

## `promptfoo redteam plugins`

List all available red team plugins.

| Option       | Description                               |
| ------------ | ----------------------------------------- |
| `--ids-only` | Show only plugin IDs without descriptions |
| `--default`  | Show only the default plugins             |

## Specifying Command Line Options in Config

Many command line options can be specified directly in your `promptfooconfig.yaml` file using the `commandLineOptions` section. This is convenient for options you frequently use or want to set as defaults for your project.

Example:

```yaml title="promptfooconfig.yaml"
prompts:
  - Write a funny tweet about {{topic}}
providers:
  - openai:o3-mini
tests:
  - file://test_cases.csv

# Command line options as defaults
commandLineOptions:
  maxConcurrency: 5
  verbose: true
  table: true
  share: false
  cache: true
  tableCellMaxLength: 500
```

With this configuration, you can simply run `promptfoo eval` without specifying these options on the command line. You can still override any of these settings by providing the corresponding flag when running the command.

## ASCII-only outputs

To disable terminal colors for printed outputs, set `FORCE_COLOR=0` (this is supported by the [chalk](https://github.com/chalk/chalk) library).

For the `eval` command, you may also want to disable the progress bar and table as well, because they use special characters:

```sh
FORCE_COLOR=0 promptfoo eval --no-progress-bar --no-table
```

# Environment variables

These general-purpose environment variables are supported:

| Name                                          | Description                                                                                                                                                                                                                                                                       | Default                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `FORCE_COLOR`                                 | Set to 0 to disable terminal colors for printed outputs                                                                                                                                                                                                                           |                               |
| `PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY`        | How many assertions to run at a time                                                                                                                                                                                                                                              | 3                             |
| `PROMPTFOO_CACHE_ENABLED`                     | Enable LLM request/response caching                                                                                                                                                                                                                                               | `false`                       |
| `PROMPTFOO_CONFIG_DIR`                        | Directory that stores eval history                                                                                                                                                                                                                                                | `~/.promptfoo`                |
| `PROMPTFOO_DISABLE_AJV_STRICT_MODE`           | If set, disables AJV strict mode for JSON schema validation                                                                                                                                                                                                                       |                               |
| `PROMPTFOO_DISABLE_CONVERSATION_VAR`          | Prevents the `_conversation` variable from being set                                                                                                                                                                                                                              |                               |
| `PROMPTFOO_DISABLE_ERROR_LOG`                 | Prevents error logs from being written to a file                                                                                                                                                                                                                                  |                               |
| `PROMPTFOO_DISABLE_DEBUG_LOG`                 | Prevents debug logs from being written to a file                                                                                                                                                                                                                                  |                               |
| `PROMPTFOO_DISABLE_JSON_AUTOESCAPE`           | If set, disables smart variable substitution within JSON prompts                                                                                                                                                                                                                  |                               |
| `PROMPTFOO_DISABLE_OBJECT_STRINGIFY`          | Disable object stringification in templates. When false (default), objects are stringified to prevent `[object Object]` issues. When true, allows direct property access (e.g., `{{output.property}}`).                                                                           | `false`                       |
| `PROMPTFOO_DISABLE_REF_PARSER`                | Prevents JSON schema dereferencing                                                                                                                                                                                                                                                |                               |
| `PROMPTFOO_DISABLE_REMOTE_GENERATION`         | Disables ALL remote generation (including SimulatedUser and red team features). When set to `1`, `true`, or `yes`, all operations run locally. This is a superset of `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION`. Example: `PROMPTFOO_DISABLE_REMOTE_GENERATION=true`           | `false`                       |
| `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION` | Disables remote generation for red team features only (harmful content, red team strategies, red team simulated users). Does NOT affect regular SimulatedUser usage. Subset of `PROMPTFOO_DISABLE_REMOTE_GENERATION`. Example: `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true` | `false`                       |
| `PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS`         | Disables OS environment variables in templates. When true, only config `env:` variables are available in templates.                                                                                                                                                               | `false` (true in self-hosted) |
| `PROMPTFOO_DISABLE_TEMPLATING`                | Disables Nunjucks template processing                                                                                                                                                                                                                                             | `false`                       |
| `PROMPTFOO_DISABLE_VAR_EXPANSION`             | Prevents Array-type vars from being expanded into multiple test cases                                                                                                                                                                                                             |                               |
| `PROMPTFOO_FAILED_TEST_EXIT_CODE`             | Override the exit code when there is at least 1 test case failure or when the pass rate is below PROMPTFOO_PASS_RATE_THRESHOLD                                                                                                                                                    | 100                           |
| `PROMPTFOO_LOG_DIR`                           | Directory to write log files (both debug and error logs). Overrides the default `~/.promptfoo/logs` directory.                                                                                                                                                                    | `~/.promptfoo/logs`           |
| `PROMPTFOO_PASS_RATE_THRESHOLD`               | Set a minimum pass rate threshold (as a percentage). If not set, defaults to 100% (no failures allowed)                                                                                                                                                                           | 100                           |
| `PROMPTFOO_REQUIRE_JSON_PROMPTS`              | By default the chat completion provider will wrap non-JSON messages in a single user message. Setting this envar to true disables that behavior.                                                                                                                                  |                               |
| `PROMPTFOO_SHARE_CHUNK_SIZE`                  | Number of results to send in each chunk. This is used to estimate the size of the results and to determine the number of chunks to send.                                                                                                                                          |                               |
| `PROMPTFOO_EVAL_TIMEOUT_MS`                   | Timeout in milliseconds for each individual test case/provider API call. When reached, that specific test is marked as an error.                                                                                                                                                  |                               |
| `PROMPTFOO_MAX_EVAL_TIME_MS`                  | Maximum total runtime in milliseconds for the entire evaluation process. When reached, all remaining tests are marked as errors and the eval ends.                                                                                                                                |                               |
| `PROMPTFOO_STRIP_GRADING_RESULT`              | Strip grading results from results to reduce memory usage                                                                                                                                                                                                                         | false                         |
| `PROMPTFOO_STRIP_METADATA`                    | Strip metadata from results to reduce memory usage                                                                                                                                                                                                                                | false                         |
| `PROMPTFOO_STRIP_PROMPT_TEXT`                 | Strip prompt text from results to reduce memory usage                                                                                                                                                                                                                             | false                         |
| `PROMPTFOO_STRIP_RESPONSE_OUTPUT`             | Strip model response outputs from results to reduce memory usage                                                                                                                                                                                                                  | false                         |
| `PROMPTFOO_STRIP_TEST_VARS`                   | Strip test variables from results to reduce memory usage                                                                                                                                                                                                                          | false                         |
| `PROMPTFOO_SELF_HOSTED`                       | Enables self-hosted mode. When true, disables OS environment variables in templates (only config `env:` values available), disables telemetry, and modifies other behaviors for controlled environments                                                                           | `false`                       |

:::tip
promptfoo will load environment variables from the `.env` in your current working directory.
:::

:::tip
For detailed information on using timeout features, including configuration examples and troubleshooting tips, see [Timeout errors in the troubleshooting guide](/docs/usage/troubleshooting#how-to-triage-stuck-evals).
:::
