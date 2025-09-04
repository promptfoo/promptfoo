# bedrock-agentcore (AWS Bedrock AgentCore Example)

This example demonstrates how to use AWS Bedrock AgentCore with promptfoo to test and evaluate deployed AI agents, including both single-agent and multi-agent scenarios.

You can run this example with:

```bash
npx promptfoo@latest init --example bedrock-agentcore
```

## Prerequisites

1. An AWS account with Bedrock AgentCore access
2. One or more deployed AgentCore agents (get agent IDs from the AWS Console)
3. AWS credentials configured (via environment variables, AWS CLI, or IAM role)
4. Install the required AWS SDK:

   ```bash
   npm install @aws-sdk/client-bedrock-agent-runtime
   ```

## Setup

1. **Get your Agent ID(s)**:
   - Go to the AWS Bedrock Console
   - Navigate to Agents
   - Copy your agent ID(s) (format: `ABCDEFGHIJ`)

2. **Configure AWS Credentials** (choose one method):

   Via environment variables:

   ```bash
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_REGION=us-east-1
   ```

   Via AWS CLI profile:

   ```bash
   aws configure --profile my-bedrock-profile
   ```

   Via IAM role (if running on EC2/Lambda)

3. **Choose your configuration**:
   - `promptfooconfig.yaml`: Basic single-agent configuration
   - `promptfooconfig.multi-agent.yaml`: Advanced multi-agent system configuration

## Running the Examples

### Single Agent Example

```bash
# Run basic agent evaluation
npx promptfoo eval -c promptfooconfig.yaml

# View results in the web UI
npx promptfoo view
```

### Multi-Agent Example

```bash
# Run multi-agent system evaluation
npx promptfoo eval -c promptfooconfig.multi-agent.yaml

# View results in the web UI
npx promptfoo view
```

## Configuration Options

### Basic Usage

```yaml
providers:
  - bedrock:agentcore:YOUR_AGENT_ID
```

### Advanced Single Agent Configuration

```yaml
providers:
  - id: bedrock:agentcore:my-agent
    config:
      agentId: YOUR_AGENT_ID
      agentAliasId: PROD_ALIAS # Optional: specific version/alias
      region: us-east-1 # AWS region
      sessionId: session-123 # Maintain conversation state
      enableTrace: true # Get detailed execution traces
      memoryId: SHORT_TERM_MEMORY # or LONG_TERM_MEMORY
```

### Multi-Agent System Configuration

```yaml
providers:
  # Technical Support Agent
  - id: tech-agent
    provider: bedrock:agentcore:TECH_AGENT_ID
    config:
      agentId: TECH_AGENT_ID
      agentAliasId: TECH_ALIAS_ID
      region: us-east-1
      enableTrace: true
      memoryId: LONG_TERM_MEMORY

  # Billing Agent
  - id: billing-agent
    provider: bedrock:agentcore:BILLING_AGENT_ID
    config:
      agentId: BILLING_AGENT_ID
      agentAliasId: BILLING_ALIAS_ID
      region: us-east-1
      enableTrace: true
```

## Features

### Session Management

The provider supports maintaining conversation state across multiple interactions:

```yaml
config:
  sessionId: my-session-123 # Use the same session ID for related queries
```

### Memory Integration

Enable agent memory for context-aware responses:

```yaml
config:
  memoryId: LONG_TERM_MEMORY # or SHORT_TERM_MEMORY
```

### Trace Information

Get detailed execution traces including tool calls and reasoning:

```yaml
config:
  enableTrace: true # Response will include trace metadata
```

## Testing Scenarios

### Single Agent Tests

The basic config includes tests for:

- Basic agent responses
- Tool/function calling (e.g., calculator)
- Memory retention
- Multi-turn conversations

### Multi-Agent System Tests

The multi-agent config includes tests for:

- Specialized agent capabilities (technical, billing, product)
- Cross-functional issue handling
- Agent collaboration and coordination
- Escalation management
- Performance and latency validation

## Multi-Agent System Architecture

The multi-agent example demonstrates a customer support system with specialized agents:

```text
Customer Query
     ↓
[Supervisor Agent] ← Monitors & Routes
     ↓
┌─────────────────┬─────────────────┬──────────────────┐
│  Tech Agent     │  Billing Agent  │  Product Agent   │
│  (Technical)    │  (Payments)     │  (Recommendations)│
└─────────────────┴─────────────────┴──────────────────┘
```

## Troubleshooting

1. **Authentication Error**: Ensure AWS credentials are properly configured
2. **Agent Not Found**: Verify the agent ID and region
3. **Permissions Error**: Check IAM permissions for `bedrock:InvokeAgent`
4. **Timeout**: Large agent responses may take time; adjust timeout if needed
5. **Multi-Agent Issues**: Ensure all agent IDs and aliases are correct in the config

## IAM Permissions

Your AWS credentials need the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeAgent"],
      "Resource": "arn:aws:bedrock:*:*:agent/*"
    }
  ]
}
```

## Learn More

- [AWS Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Promptfoo Documentation](https://promptfoo.dev/docs/providers/bedrock/)
- [AgentCore Samples](https://github.com/awslabs/amazon-bedrock-agentcore-samples)
