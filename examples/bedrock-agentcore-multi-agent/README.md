# Multi-Agent System Example with AWS Bedrock AgentCore

This advanced example demonstrates how to test and evaluate a multi-agent customer support system using AWS Bedrock AgentCore. It showcases agent specialization, collaboration, memory persistence, and escalation handling.

## 🎯 Use Case

A customer support system with specialized agents:

- **Technical Support Agent**: Handles technical issues and troubleshooting
- **Billing Agent**: Manages payment, refunds, and subscription queries
- **Product Specialist**: Provides product recommendations and comparisons
- **Supervisor Agent**: Routes complex queries and handles escalations

## 🏗️ Architecture

```text
Customer Query
      ↓
[Supervisor Agent] ← Monitors & Routes
      ↓
   Dispatch to:
      ├── [Technical Agent]    (Technical Issues)
      ├── [Billing Agent]      (Payment/Subscription)
      └── [Product Agent]      (Recommendations)
```

## 📋 Prerequisites

1. **Deploy Your Agents**: Create and deploy each specialized agent in AWS Bedrock:

   ```bash
   # Example: Create a technical support agent
   aws bedrock-agent create-agent \
     --agent-name "TechnicalSupportAgent" \
     --foundation-model "anthropic.claude-3-sonnet-20240229-v1:0" \
     --instruction "You are a technical support specialist..." \
     --agent-resource-role-arn "arn:aws:iam::YOUR_ACCOUNT:role/BedrockAgentRole"
   ```

2. **Configure Agent Tools**: Each agent should have access to relevant tools:
   - Technical Agent: Knowledge bases, API documentation, error lookups
   - Billing Agent: Payment systems, subscription management
   - Product Agent: Product catalog, pricing calculator
   - Supervisor Agent: Escalation workflows, agent routing

3. **Enable Memory**: Configure long-term memory for customer context persistence

## 🚀 Running the Tests

1. **Update Agent IDs** in `config.yaml`:

   ```yaml
   providers:
     - id: tech-agent
       bedrock:agentcore:YOUR_TECH_AGENT_ID
   ```

2. **Run the evaluation**:

   ```bash
   npx promptfoo eval -c config.yaml
   ```

3. **View results**:
   ```bash
   npx promptfoo view
   ```

## 🧪 Test Scenarios

### 1. Single Agent Tests

Tests each agent's specialized capabilities:

- Technical agent solving error codes
- Billing agent handling refunds
- Product agent making recommendations

### 2. Multi-Agent Coordination

Tests how agents work together on complex issues:

```yaml
providers:
  - tech-agent
  - billing-agent
```

### 3. Memory Persistence

Verifies agents remember customer context:

```yaml
tests:
  - query: 'My customer ID is CUST-12345'
  - query: 'What is my customer ID?' # Should remember
```

### 4. Trace Analysis

Examines agent decision-making through traces:

```javascript
// Check which tools the agent used
metadata.trace.toolCalls.map((t) => t.name);
```

## 📊 Metrics Evaluated

- **Response Quality**: Relevance and accuracy of answers
- **Latency**: Response time under 5 seconds
- **Memory Retention**: Context persistence across queries
- **Tool Usage**: Appropriate tool selection for tasks
- **Tone**: Professional and helpful communication
- **Escalation**: Proper handling of frustrated customers

## 🔧 Customization

### Add New Agents

```yaml
providers:
  - id: legal-agent
    bedrock:agentcore:LEGAL_AGENT_ID
    config:
      instruction: "Legal compliance specialist..."
```

### Test Agent Handoffs

```yaml
tests:
  - description: 'Handoff from tech to billing'
    vars:
      query: 'Fixed my technical issue, now need billing help'
    providers:
      - tech-agent
      - billing-agent
```

### Implement Routing Logic

```javascript
// Supervisor agent decides which specialist to engage
assert:
  - type: javascript
    value: |
      metadata.trace.toolCalls.some(call =>
        call.name === 'route_to_specialist'
      )
```

## 🎨 Advanced Patterns

### 1. Sequential Agent Chains

```yaml
tests:
  - providers: [supervisor-agent] # First: Analyze issue
  - providers: [tech-agent] # Then: Technical solution
  - providers: [billing-agent] # Finally: Billing adjustment
```

### 2. Parallel Agent Consultation

```yaml
providers:
  - tech-agent
  - product-agent
  # Both agents work simultaneously
```

### 3. Agent Voting System

```javascript
// Multiple agents provide solutions, pick consensus
const responses = [outputs['agent1'], outputs['agent2'], outputs['agent3']];
return mostCommonSolution(responses);
```

## 📈 Performance Optimization

1. **Use Session IDs** for related queries:

   ```yaml
   config:
     sessionId: 'customer-session-001'
   ```

2. **Enable Caching** for development:

   ```yaml
   options:
     cache: true
   ```

3. **Limit Concurrency** to avoid rate limits:
   ```yaml
   options:
     maxConcurrency: 2
   ```

## 🔍 Debugging Tips

1. **Enable Traces** to see agent reasoning:

   ```yaml
   config:
     enableTrace: true
   ```

2. **Check Tool Calls** in metadata:

   ```bash
   npx promptfoo eval -c config.yaml -o results.json
   cat results.json | jq '.results.results[0].response.metadata.trace'
   ```

3. **Monitor Memory Usage**:
   ```yaml
   memoryConfig:
     type: long-term
     enabled: true
   ```

## 🎯 Success Criteria

A well-functioning multi-agent system should:

- ✅ Route queries to appropriate specialists
- ✅ Remember customer context across interactions
- ✅ Collaborate on complex, multi-faceted issues
- ✅ Escalate appropriately when needed
- ✅ Maintain consistent, professional communication
- ✅ Respond within acceptable latency thresholds

## 📚 Learn More

- [AWS Bedrock AgentCore Documentation](https://aws.amazon.com/bedrock/agentcore/)
- [Building Multi-Agent Systems](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-multi.html)
- [Agent Memory Management](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-memory.html)
- [Promptfoo Testing Strategies](https://promptfoo.dev/docs/guides/testing-strategies/)
