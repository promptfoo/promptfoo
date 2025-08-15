# AWS Bedrock AgentCore Example

This example demonstrates how to use AWS Bedrock AgentCore with promptfoo to test and evaluate deployed AI agents.

## Prerequisites

1. An AWS account with Bedrock AgentCore access
2. A deployed AgentCore agent (get the agent ID from the AWS Console)
3. AWS credentials configured (via environment variables, AWS CLI, or IAM role)
4. Install the required AWS SDK:
   ```bash
   npm install @aws-sdk/client-bedrock-agent-runtime
   ```

## Setup

1. **Get your Agent ID**:
   - Go to the AWS Bedrock Console
   - Navigate to Agents
   - Copy your agent ID (format: `ABCDEFGHIJ`)

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

3. **Update config.yaml**:
   - Replace `ABCDEFGHIJ` with your actual agent ID
   - Update the region if your agent is in a different region
   - Optionally configure agent alias, session, and memory settings

## Running the Example

```bash
# Run the evaluation
npx promptfoo eval -c config.yaml

# View results in the web UI
npx promptfoo view
```

## Configuration Options

### Basic Usage

```yaml
providers:
  - bedrock:agentcore:YOUR_AGENT_ID
```

### Advanced Configuration

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
  memoryId: LONG_TERM_MEMORY # Persistent memory across sessions
```

### Trace Information

Get detailed execution traces including tool calls and reasoning:

```yaml
config:
  enableTrace: true # Response will include trace metadata
```

## Testing Agent Capabilities

The example config includes tests for:

- Basic agent responses
- Tool/function calling (e.g., calculator)
- Memory retention
- Multi-turn conversations

## Troubleshooting

1. **Authentication Error**: Ensure AWS credentials are properly configured
2. **Agent Not Found**: Verify the agent ID and region
3. **Permissions Error**: Check IAM permissions for `bedrock:InvokeAgent`
4. **Timeout**: Large agent responses may take time; adjust timeout if needed

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
