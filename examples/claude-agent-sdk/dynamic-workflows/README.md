# claude-agent-sdk/dynamic-workflows (Claude Agent SDK Dynamic Workflows)

Run a local Claude Agent SDK workflow and assert both its final answer and its `Workflow` tool call.

## Run

```sh
npx promptfoo@latest init --example claude-agent-sdk/dynamic-workflows
cd claude-agent-sdk/dynamic-workflows
npm install @anthropic-ai/claude-agent-sdk@^0.3.284
export ANTHROPIC_API_KEY=your-api-key
npx promptfoo@latest eval --no-cache -o results.json
```

The provider exposes and permits `Workflow` through `custom_allowed_tools`. Ask for a workflow explicitly in the prompt. The example runs in Promptfoo's temporary workspace, has no additional tools enabled, and sets a $1 SDK budget.

For an existing Claude Code login, set `apiKeyRequired: false` instead of supplying an API key. To evaluate agents hosted by Anthropic, use [Claude Managed Agents](../../claude-managed-agents/).
