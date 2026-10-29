# artifacts (Verify a published ledger)

The agent reads a ledger and writes a two-line CSV to `/workspace/outputs/summary.csv`. It replies `READY` so that the acknowledgement and the published file can be graded independently.

Use an OpenAI project key in `OPENAI_API_KEY` with `api.agents.read`, `api.agents.write`, and `api.responses.write`. The key belongs in the terminal running the eval. Keep it outside the sandbox.

```sh
npx promptfoo@latest init --example openai-agents-api
cd openai-agents-api
npx promptfoo@latest eval -c artifacts/promptfooconfig.yaml --no-cache -o artifact.json
```

From a Promptfoo source checkout, run this from the repository root:

```sh
npm run local -- eval -c examples/openai-agents-api/artifacts/promptfooconfig.yaml --no-cache -o artifact.json
```

The `equals` assertion checks the final message. The `PublishedArtifact` assertion takes the session and root turn IDs from the provider response, looks up the exact path, and compares the immutable artifact with the expected UTF-8 bytes, including the final newline. Change the expected total in the assertion from `147` to `148` for a negative control. The acknowledgement should still pass while the artifact check fails. Open the row's assertion details in the results UI to see both grades.

The provider retains the session long enough for the assertion to read the file. The assertion then deletes the session, even when the bytes differ or the read fails. If the process stops before the assertion finishes, or its deletion request fails, use the recorded session ID to clean up manually. Regrade by running a fresh eval. See [OpenAI’s files and artifacts guide](https://developers.openai.com/api/docs/guides/agents-api/environments/files) for artifact publication and lifetime.
