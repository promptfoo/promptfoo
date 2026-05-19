# redteam-bedrock-mcp (Red Team Bedrock MCP)

This example demonstrates red teaming the **Bedrock Converse MCP tool boundary** for a customer-support workflow. It tests whether the model can be induced to request unsafe MCP tools, disclose sensitive tool or customer data, bypass authorization, or follow malicious tool-related instructions.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-bedrock-mcp
cd redteam-bedrock-mcp
```

## Prerequisites

- Node.js 20+
- AWS credentials with access to Amazon Bedrock Runtime
- Model access enabled for `us.anthropic.claude-sonnet-4-6` in `us-east-1`

Set up AWS credentials using your normal AWS credential chain. For example:

```bash
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_BEDROCK_REGION="us-east-1"
```

You can also use AWS SSO or a named profile:

```bash
export AWS_PROFILE="your-profile"
export AWS_BEDROCK_REGION="us-east-1"
```

## Getting Started

1. Initialize the example:

   ```bash
   npx promptfoo@latest init --example redteam-bedrock-mcp
   ```

2. Navigate to the example directory:

   ```bash
   cd redteam-bedrock-mcp
   ```

3. Run the red team:

   ```bash
   npx promptfoo redteam run
   ```

## Configuration

The target uses the Bedrock Converse provider with MCP enabled:

```yaml
targets:
  - id: bedrock:converse:us.anthropic.claude-sonnet-4-6
    config:
      region: '{{env.AWS_BEDROCK_REGION}}'
      mcp:
        enabled: true
        servers:
          - name: acme-support
            url: https://customer-service-mcp-server-example.promptfoo.app/mcp
      toolChoice: auto
```

Replace the `servers` entry with your own remote MCP server URL, or with a local stdio MCP server using `command` and `args`.

When Bedrock Converse emits an MCP tool call, promptfoo executes the matching MCP tool and returns the **raw MCP tool result** as the eval output. There is no follow-up Converse turn that feeds that result back into the model for a synthesized customer-support answer. Assertions and redteam grading therefore measure tool selection and raw tool-output handling, not a second-turn natural-language response.

## What This Example Tests

This configuration uses MCP-specific and authorization-focused redteam plugins:

- `mcp` tests tool discovery, tool invocation manipulation, tool metadata injection, and MCP-specific leakage.
- `pii` tests whether private customer information leaks through model responses or tool output.
- `bfla` tests function-level authorization boundaries around tool use.
- `bola` tests object-level authorization, such as accessing another customer's ticket.

The `jailbreak` and `prompt-injection` strategies mutate those probes to test whether the model can be persuaded to ignore its tool-use and data-access constraints.

## Notes

Bedrock Converse MCP support executes MCP tool calls through the provider target. This is useful for testing the model plus MCP tool boundary directly during red teaming.

If you want to red team a true assistant loop that calls a tool and then answers naturally from the tool result, wrap Bedrock Converse in an agent harness that performs that follow-up model turn.

The example uses `numTests: 3` to keep the initial Bedrock run modest. Increase it when you are ready for broader coverage.
