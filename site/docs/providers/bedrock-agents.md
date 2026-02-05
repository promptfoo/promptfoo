---
title: AWS Bedrock Agents
description: Configure and test Amazon Bedrock Agents in promptfoo, including setup, authentication, session management, knowledge bases, and tracing options.
sidebar_label: AWS Bedrock Agents
---

# AWS Bedrock Agents

The AWS Bedrock Agents provider enables you to test and evaluate AI agents built with Amazon Bedrock Agents. Amazon Bedrock Agents uses the reasoning of foundation models (FMs), APIs, and data to break down user requests, gathers relevant information, and efficiently completes tasks—freeing teams to focus on high-value work.

## Prerequisites

- AWS account with Bedrock Agents access
- A deployed Bedrock agent with an active alias
- AWS SDK installed: `npm install @aws-sdk/client-bedrock-agent-runtime`
- IAM permissions for `bedrock:InvokeAgent`

## Basic Configuration

```yaml
providers:
  - bedrock-agent:YOUR_AGENT_ID
    config:
      agentAliasId: PROD_ALIAS_ID  # Required
      region: us-east-1
```

## Full Configuration Options

The Bedrock Agents provider supports all features of AWS Bedrock agents:

```yaml
providers:
  - id: bedrock-agent:my-agent
    config:
      # Required
      agentId: ABCDEFGHIJ
      agentAliasId: PROD_ALIAS_ID

      # AWS Authentication (optional - uses default chain if not provided)
      region: us-east-1
      accessKeyId: YOUR_ACCESS_KEY
      secretAccessKey: YOUR_SECRET_KEY
      sessionToken: YOUR_SESSION_TOKEN # For temporary credentials
      profile: my-aws-profile # Use AWS SSO profile

      # Session Management
      sessionId: user-session-123 # Maintain conversation state
      sessionState:
        sessionAttributes:
          userId: 'user-123'
          department: 'engineering'
        promptSessionAttributes:
          context: 'technical support'
        invocationId: 'inv-456' # Track specific invocations

      # Memory Configuration
      memoryId: LONG_TERM_MEMORY # or SHORT_TERM_MEMORY

      # Execution Options
      enableTrace: true # Get detailed execution traces
      endSession: false # Keep session alive

      # Inference Configuration
      inferenceConfig:
        temperature: 0.7
        topP: 0.9
        topK: 50
        maximumLength: 2048
        stopSequences: ['END', 'STOP']

      # Guardrails
      guardrailConfiguration:
        guardrailId: GUARDRAIL_ID
        guardrailVersion: '1'

      # Knowledge Base Configuration
      knowledgeBaseConfigurations:
        - knowledgeBaseId: KB_ID_1
          retrievalConfiguration:
            vectorSearchConfiguration:
              numberOfResults: 5
              overrideSearchType: HYBRID # or SEMANTIC
              filter:
                category: 'technical'
        - knowledgeBaseId: KB_ID_2

      # Action Groups (Tools)
      actionGroups:
        - actionGroupName: 'calculator'
          actionGroupExecutor:
            lambda: 'arn:aws:lambda:...'
          description: 'Math operations'
        - actionGroupName: 'database'
          actionGroupExecutor:
            customControl: RETURN_CONTROL
          apiSchema:
            s3:
              s3BucketName: 'my-bucket'
              s3ObjectKey: 'api-schema.json'

      # Prompt Override
      promptOverrideConfiguration:
        promptConfigurations:
          - promptType: PRE_PROCESSING
            promptCreationMode: OVERRIDDEN
            basePromptTemplate: 'Custom preprocessing: {input}'
            inferenceConfiguration:
              temperature: 0.5
          - promptType: ORCHESTRATION
            promptState: DISABLED

      # Content Filtering
      inputDataConfig:
        bypassLambdaParsing: false
        filters:
          - name: 'pii-filter'
            type: PREPROCESSING
            inputType: TEXT
            outputType: TEXT
```

## Features

### Session Management

Maintain conversation context across multiple interactions:

```yaml
tests:
  - vars:
      query: "My order number is 12345"
    providers:
      - bedrock-agent:support-agent
        config:
          sessionId: "customer-session-001"

  - vars:
      query: "What's the status of my order?"
    providers:
      - bedrock-agent:support-agent
        config:
          sessionId: "customer-session-001"  # Same session
    assert:
      - type: contains
        value: "12345"  # Agent should remember the order number
```

### Memory Types

Configure agent memory for different use cases:

```yaml
# Short-term memory (session-based)
config:
  memoryId: SHORT_TERM_MEMORY

# Long-term memory (persistent)
config:
  memoryId: LONG_TERM_MEMORY
```

### Knowledge Base Integration

Connect agents to knowledge bases for RAG capabilities:

```yaml
config:
  knowledgeBaseConfigurations:
    - knowledgeBaseId: 'technical-docs-kb'
      retrievalConfiguration:
        vectorSearchConfiguration:
          numberOfResults: 10
          overrideSearchType: HYBRID
          filter:
            documentType: 'manual'
            product: 'widget-pro'
```

### Action Groups (Tools)

Enable agents to use tools and APIs:

```yaml
config:
  actionGroups:
    - actionGroupName: 'weather-api'
      actionGroupExecutor:
        lambda: 'arn:aws:lambda:us-east-1:123456789:function:WeatherAPI'
      description: 'Get weather information'

    - actionGroupName: 'database-query'
      actionGroupExecutor:
        customControl: RETURN_CONTROL # Agent returns control to caller
```

### Guardrails

Apply content filtering and safety measures:

```yaml
config:
  guardrailConfiguration:
    guardrailId: 'content-filter-001'
    guardrailVersion: '2'
```

### Inference Control

Fine-tune agent response generation:

```yaml
config:
  inferenceConfig:
    temperature: 0.3 # Lower for more deterministic responses
    topP: 0.95
    topK: 40
    maximumLength: 4096
    stopSequences: ['END_RESPONSE', "\n\n"]
```

### Trace Information

Get detailed execution traces for debugging:

```yaml
config:
  enableTrace: true

tests:
  - vars:
      query: 'Calculate 25 * 4'
    assert:
      - type: javascript
        value: |
          // Check trace for tool usage
          metadata?.trace?.some(t => 
            t.actionGroupTrace?.actionGroupName === 'calculator'
          )
```

## Authentication

The provider supports multiple authentication methods:

1. **Environment Variables** (recommended):

   ```bash
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_REGION=us-east-1
   ```

2. **AWS Profile**:

   ```yaml
   config:
     profile: my-aws-profile
   ```

3. **Explicit Credentials**:

   ```yaml
   config:
     accessKeyId: YOUR_ACCESS_KEY
     secretAccessKey: YOUR_SECRET_KEY
   ```

4. **IAM Role** (when running on AWS infrastructure)

## Response Format

The provider returns responses with the following structure:

```typescript
{
  output: string;           // Agent's response text
  metadata?: {
    sessionId?: string;     // Session identifier
    memoryId?: string;      // Memory type used
    trace?: Array<any>;     // Execution traces (if enableTrace: true)
    guardrails?: {          // Guardrail application info
      applied: boolean;
      guardrailId: string;
      guardrailVersion: string;
    };
  };
  cached?: boolean;         // Whether response was cached
  error?: string;           // Error message if failed
}
```

## Testing Examples

### Basic Agent Testing

```yaml
description: 'Test customer support agent'

providers:
  - id: support-agent
    provider: bedrock-agent:SUPPORT_AGENT_ID
    config:
      agentAliasId: PROD_ALIAS
      enableTrace: true

prompts:
  - 'How do I reset my password?'
  - 'What are your business hours?'
  - 'I need to speak with a manager'

tests:
  - vars:
      query: '{{prompt}}'
    assert:
      - type: not-empty
      - type: latency
        threshold: 5000
```

### Multi-Turn Conversation Testing

```yaml
tests:
  # First turn - provide context
  - vars:
      query: "I'm having trouble with product SKU-123"
    providers:
      - id: agent-session-1
        provider: bedrock-agent:AGENT_ID
        config:
          sessionId: 'test-session-001'
          sessionState:
            sessionAttributes:
              customerId: 'CUST-456'

  # Second turn - test context retention
  - vars:
      query: 'What warranty options are available?'
    providers:
      - id: agent-session-1
        provider: bedrock-agent:AGENT_ID
        config:
          sessionId: 'test-session-001' # Same session
    assert:
      - type: contains
        value: 'SKU-123' # Should remember the product
```

### Knowledge Base Validation

```yaml
tests:
  - vars:
      query: "What's the maximum file upload size?"
    providers:
      - bedrock-agent:AGENT_ID
        config:
          knowledgeBaseConfigurations:
            - knowledgeBaseId: "docs-kb"
              retrievalConfiguration:
                vectorSearchConfiguration:
                  numberOfResults: 3
    assert:
      - type: contains-any
        value: ["10MB", "10 megabytes", "ten megabytes"]
```

### Tool Usage Verification

```yaml
tests:
  - vars:
      query: "What's the weather in Seattle?"
    providers:
      - bedrock-agent:AGENT_ID
        config:
          enableTrace: true
          actionGroups:
            - actionGroupName: "weather-api"
    assert:
      - type: javascript
        value: |
          // Verify the weather API was called
          metadata?.trace?.some(trace =>
            trace.actionGroupTrace?.actionGroupName === 'weather-api'
          )
```

## Error Handling

The provider includes specific error messages for common issues:

- **ResourceNotFoundException**: Agent or alias not found
- **AccessDeniedException**: IAM permission issues
- **ValidationException**: Invalid configuration
- **ThrottlingException**: Rate limit exceeded

## Performance Optimization

1. **Use Caching** for identical queries:

   ```yaml
   providers:
     - bedrock-agent:AGENT_ID
       config:
         cache: true  # Responses are cached by default
   ```

2. **Optimize Knowledge Base Queries**:

   ```yaml
   knowledgeBaseConfigurations:
     - knowledgeBaseId: KB_ID
       retrievalConfiguration:
         vectorSearchConfiguration:
           numberOfResults: 3 # Limit to necessary results
   ```

3. **Control Response Length**:

   ```yaml
   inferenceConfig:
     maximumLength: 1024 # Limit response size
   ```

## Troubleshooting

### Agent Not Responding

1. Verify agent is deployed and alias is active:

   ```bash
   aws bedrock-agent get-agent --agent-id YOUR_AGENT_ID
   aws bedrock-agent get-agent-alias --agent-id YOUR_AGENT_ID --agent-alias-id YOUR_ALIAS_ID
   ```

2. Check IAM permissions include:

   ```json
   {
     "Effect": "Allow",
     "Action": "bedrock:InvokeAgent",
     "Resource": "arn:aws:bedrock:*:*:agent/*"
   }
   ```

### Session/Memory Not Working

Ensure consistent session IDs and correct memory type:

```yaml
config:
  sessionId: 'consistent-session-id'
  memoryId: 'LONG_TERM_MEMORY' # Must match agent configuration
```

### Knowledge Base Not Returning Results

Verify knowledge base is synced and accessible:

```bash
aws bedrock-agent list-agent-knowledge-bases --agent-id YOUR_AGENT_ID
```

## See Also

- [AWS Bedrock Agents Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Agent API Reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html)
- [Knowledge Base Setup](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [Guardrails Configuration](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html)
- [AWS Bedrock Provider Overview](./aws-bedrock.md)
- [Configuration Reference](../configuration/reference.md)
