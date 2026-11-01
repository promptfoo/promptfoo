# openai-agents-api/artifacts (Verify a published ledger)

The agent reads a ledger and writes a two-line CSV to `/workspace/outputs/summary.csv`. It replies `READY` so that the acknowledgement and the published file can be graded independently.

## Run

Use an OpenAI project key in `OPENAI_API_KEY` with `api.agents.read`, `api.agents.write`, and `api.responses.write`. The key belongs in the terminal running the eval. Keep it outside the sandbox.

```sh
npx promptfoo@latest init --example openai-agents-api/artifacts
cd openai-agents-api/artifacts
npx promptfoo@latest eval --no-cache -o artifact.json
```

From a Promptfoo source checkout, run this from the repository root:

```sh
npm run local -- eval -c examples/openai-agents-api/artifacts/promptfooconfig.yaml --no-cache -o artifact.json
```

## Inspect the result

The `equals` assertion checks the final message. Before deleting the session, Promptfoo looks up the path listed in `artifactPaths` for the completed root turn. It hashes the published file and records its SHA-256 digest and size in `response.metadata.artifacts`. The `PublishedArtifact` assertion compares that evidence with the expected UTF-8 CSV, including the final newline. The expected file is 14 bytes.

Open the row’s assertion details in the results UI to see both grades. To try a negative control, change the expected total in the assertion from `147` to `148` and run the eval again. The agent still sees the same ledger. Its `READY` reply can pass while the artifact check fails.

In the JSON export, look for `status: available` on the artifact and `response.metadata.sessionDeleted: true` on the session. A `missing` artifact means that the root turn did not publish the requested path. An `unavailable` artifact means Promptfoo could not verify the file. To inspect the CSV itself, set `retainSession: true` before running the eval, download the file using the recorded session ID, then delete the session. [OpenAI’s files and artifacts guide](https://developers.openai.com/api/docs/guides/agents-api/environments/files)
