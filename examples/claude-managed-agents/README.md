# claude-managed-agents (Claude Managed Agents)

Evaluate a hosted Claude Managed Agent and its dynamic workflow. The example creates an agent and cloud environment, starts a fresh session for each test, and archives the resources it created when finished. It checks both the answer and evidence that a workflow ran.

## Run

Requires an Anthropic API key with Managed Agents access. Hosted sessions incur Anthropic token and runtime charges; the example sets a $1 list-cost budget per session.

```sh
npx promptfoo@latest init --example claude-managed-agents
cd claude-managed-agents
export ANTHROPIC_API_KEY=your-api-key
npx promptfoo@latest eval --no-cache -o results.json
```

To test an existing agent, replace `agent` with `agent_id: agent_...` and replace `environment` with `environment_id: env_...`. Enable workflows on that agent first. Existing definitions are never modified or archived by Promptfoo.

See [provider configuration](https://www.promptfoo.dev/docs/providers/claude-managed-agents/) and [Anthropic's quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart).

For locally executed workflows, use the separate [Claude Agent SDK example](../claude-agent-sdk/dynamic-workflows/).
