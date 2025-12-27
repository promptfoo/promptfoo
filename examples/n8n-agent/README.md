# n8n-agent (n8n AI Agent Evaluation)

You can run this example with:

```bash
npx promptfoo@latest init --example n8n-agent
```

This example demonstrates how to evaluate n8n AI agents and workflows using the n8n provider.

## Prerequisites

1. A self-hosted n8n instance with a webhook-triggered workflow
2. An AI agent workflow that accepts messages and returns responses

## Setup

1. Create an n8n workflow with a Webhook trigger node
2. Add your AI agent logic (e.g., AI Agent node, OpenAI node)
3. Configure the workflow to return the agent's response
4. Update `promptfooconfig.yaml` with your webhook URL:

```yaml
providers:
  - id: n8n:https://your-n8n-instance.com/webhook/your-agent-id
```

### Environment Variables

```bash
export N8N_API_KEY=your-api-key  # If your webhook requires authentication
```

## Running the Example

```bash
# Run the evaluation
npx promptfoo eval

# View results
npx promptfoo view
```

## Configuration Options

- `url`: Webhook URL (alternative to specifying in provider path)
- `method`: HTTP method (default: `POST`)
- `headers`: Additional request headers
- `body`: Custom request body template with Nunjucks support
- `transformResponse`: JavaScript expression to extract output

## Response Formats

The provider automatically handles common n8n response formats:

```javascript
{ "output": "Response text" }
{ "response": "Agent response" }
{ "message": { "content": "Hello" } }
[{ "json": { "output": "Result" } }]
```

For custom formats, use `transformResponse`:

```yaml
config:
  transformResponse: 'json.data.agentMessage'
```

For more information, see the [n8n Provider documentation](/docs/providers/n8n).
