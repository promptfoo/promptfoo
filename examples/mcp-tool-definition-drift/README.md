# mcp-tool-definition-drift (MCP Tool Definition Drift)

Check an MCP server's tool definitions against a reviewed baseline before running a tool-call eval. This example uses a local stdio server with one `get_weather(city)` tool that returns fixed weather text. It requires no LLM or API keys.

The example's standalone `check-tools.js` script collects definitions through the MCP SDK. The Promptfoo config then calls the tool and checks its output. A description can change while the tool still returns the expected answer; the definition check makes that change visible for review.

## Setup

Use Node.js 22.22.0 or newer.

```bash
npx promptfoo@latest init --example mcp-tool-definition-drift
cd mcp-tool-definition-drift
npm install
```

For an unpublished contribution, copy this example directory from the checkout instead of using `init --example`.

## Run the gate

```bash
npm run eval
```

This runs the definition check followed by the tool-call eval only if the check succeeds. The equivalent command is:

```bash
npm run check && npm exec -- promptfoo eval -c promptfooconfig.yaml --no-cache
```

With the supplied files, the definitions match `baseline.json` and the tool-call assertion passes. Both commands start the bundled server automatically.

The check uses these exit codes:

| Exit code | Result    | Meaning                                                                                                                              |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `0`       | Unchanged | All compared tool definitions match the baseline.                                                                                    |
| `1`       | Drift     | A tool was added or removed, or a compared field changed.                                                                            |
| `2`       | Error     | The check could not complete, for example because the baseline is invalid, the server is unavailable, or the tool list is paginated. |

The check reports added or removed tools and the before/after values of changed fields. It leaves `baseline.json` unchanged on every run.

## Reproduce a description change

In `server.js`, change only the tool's description:

```diff
-    description: 'Get the current weather for a city.',
+    description: "Get today's weather for a city.",
```

Run `npm run eval` again. The check reports the description change and exits with code `1`, so the tool-call eval does not run.

To see why the definition check matters, run the tool-call eval on its own:

```bash
npm exec -- promptfoo eval -c promptfooconfig.yaml --no-cache
```

The assertion still passes because the tool's output has not changed. **Running the eval directly bypasses the definition check.** Use `npm run eval` for the combined gate.

Restore the original description to return to the supplied baseline, or review and accept the change as described below.

## Review and update the baseline

To collect a proposed baseline, run:

```bash
node check-tools.js --snapshot
```

This creates `candidate.json` only after collecting and validating the tool list successfully. It never updates `baseline.json` and refuses to overwrite an existing `candidate.json`. If you already have a candidate, review it and move or delete that file yourself before collecting another.

Compare `candidate.json` with `baseline.json` and review the intended tool changes. If you approve them, copy that exact candidate into the baseline:

```bash
node -e "require('node:fs').copyFileSync('candidate.json', 'baseline.json')"
npm run eval
```

Review and commit the changed server and baseline together. Do not recollect the snapshot between review and copying: the baseline should contain the candidate you reviewed. Keep snapshot generation and baseline updates out of CI.

## CI

After checkout and Node.js setup, a workflow can run the combined gate:

```yaml
- name: Check MCP definitions and tool output
  working-directory: examples/mcp-tool-definition-drift
  run: |
    npm install
    npm run eval
```

Adjust the working directory if you copied the example elsewhere. A drift or collection error stops the command before the tool-call eval.

## Scope

- The check connects to this single local stdio server and compares every tool's `name`, `description`, and `inputSchema`. Other tool metadata is outside its scope.
- Tool order and object-key order are normalized. Array order and descriptions are preserved exactly, including whitespace. The comparison is structural; it does not classify a schema change as compatible or incompatible.
- A `nextCursor` in the tool list is an error. This example supports a single page and does not accept a partial tool list as a complete snapshot.
- Definitions do not describe tool behavior or the complete input sent to a model. The tool-call assertion separately checks one output.
- The check and eval use separate server connections. The gate cannot detect changes between those connections. The bundled server has fixed definitions and does not vary with environment variables or working directory.

## Developing in the Promptfoo repository

Use the repository's Node.js version from `.nvmrc` and install its development dependencies. From the repository root, run the check and the local CLI:

```bash
node examples/mcp-tool-definition-drift/check-tools.js && npm run local -- eval -c examples/mcp-tool-definition-drift/promptfooconfig.yaml --no-cache -o mcp-tool-definition-drift-results.json
```

Inspect the exported results for the tool output, `success`, `score`, and `error`. This command exercises the local Promptfoo source; the copied-example commands above use the installed package.
