# provider-bland (Bland Voice Agent Evaluation)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-bland
```

This example tests a [Bland](https://www.bland.ai) voice agent in text through Bland's pathway chat API, without placing calls. It checks a single question, a two-turn reschedule flow, and whether the agent stored the requested time in its variables.

## Setup

1. Create an API key in the Bland dashboard.
2. Set the key:

```bash
export BLAND_API_KEY=your_api_key
```

3. Replace `YOUR_AGENT_ID` in `promptfooconfig.yaml` with your agent's ID.
4. Run the eval:

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

The `llm-rubric` assertions need a grading provider, such as `OPENAI_API_KEY`.

## Notes

- The config tests the `staging` environment. Change `agentVersion` to `production`, `dev`, a semver, or `branch:<name>`.
- Each turn runs the agent for real: webhook and tool steps execute and messages are billed. The example uses a synthetic `from` number.
- Each response's `metadata.bland` includes the current node, the agent's variables, and the full transcript.
