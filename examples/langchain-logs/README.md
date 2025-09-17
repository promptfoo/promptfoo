# LangChain Logs Replay Example

This example demonstrates how to replay and analyze conversations from LangChain execution logs using promptfoo's custom provider system.

## Overview

This workflow allows you to:
- Replay conversations captured in LangChain execution logs
- Analyze chain execution patterns and tool usage
- Preserve performance metadata like latency and token usage
- Validate conversation quality and agent behavior

## Files

- `langchain-logs.jsonl` - Sample LangChain execution logs with conversation data
- `langchain-replay-provider.js` - Custom provider that parses LangChain logs and reconstructs conversations
- `promptfooconfig.yaml` - Configuration for LangChain log replay evaluation
- `README.md` - This file

## Sample Data

The LangChain logs contain four realistic e-commerce customer service conversations:

1. **Order Status Inquiry** (`lc_sess_001`) - Customer checks order status, agent uses order lookup tool
2. **Delivery Address Change** (`lc_sess_002`) - Customer wants to change delivery address
3. **Item Return Process** (`lc_sess_003`) - Customer initiates return process
4. **Refund Policy Question** (`lc_sess_004`) - Customer asks about refund processing times

Each session includes comprehensive LangChain execution data:
- Chain start/end events with inputs/outputs
- LLM start/end events with model and latency information
- Tool usage events (order lookup, address validation, etc.)
- Token usage and performance metrics

## LangChain Log Format

The logs follow LangChain's event structure with different event types:

### Chain Events
```json
{"timestamp": "2024-01-15T14:30:00Z", "type": "chain_start", "data": {"inputs": {"input": "user message"}}, "metadata": {"session_id": "lc_sess_001"}}
{"timestamp": "2024-01-15T14:30:03Z", "type": "chain_end", "data": {"outputs": {"output": "agent response"}}, "metadata": {"session_id": "lc_sess_001"}}
```

### LLM Events
```json
{"timestamp": "2024-01-15T14:30:01Z", "type": "llm_start", "data": {"inputs": {"prompts": ["prompt text"]}}, "metadata": {"session_id": "lc_sess_001", "model": "gpt-4"}}
{"timestamp": "2024-01-15T14:30:03Z", "type": "llm_end", "data": {"outputs": {"generations": [{"text": "response"}]}}, "metadata": {"session_id": "lc_sess_001", "latency_ms": 2100}}
```

### Tool Events
```json
{"timestamp": "2024-01-15T14:30:16Z", "type": "tool_start", "data": {"tool": "order_lookup", "inputs": {"order_id": "ORD-12345"}}, "metadata": {"session_id": "lc_sess_001"}}
{"timestamp": "2024-01-15T14:30:17Z", "type": "tool_end", "data": {"output": {"status": "shipped", "tracking": "1Z999AA1234567890"}}, "metadata": {"session_id": "lc_sess_001"}}
```

## Replay Modes

The provider supports different analysis modes:

### Conversation Mode (Default)
Returns the reconstructed conversation between user and agent:
```yaml
vars:
  sessionId: 'lc_sess_001'
  mode: 'conversation'
```

### Chain Execution Mode
Shows the chain execution flow with inputs and outputs:
```yaml
vars:
  sessionId: 'lc_sess_001'
  mode: 'chains'
```

### Tool Usage Mode
Displays all tool calls and their results:
```yaml
vars:
  sessionId: 'lc_sess_001'
  mode: 'tools'
```

### Full Analysis Mode
Comprehensive analysis including conversation, chains, and tools:
```yaml
vars:
  sessionId: 'lc_sess_001'
  mode: 'full'
```

## Running the Example

1. Install promptfoo if you haven't already:
   ```bash
   npm install -g promptfoo
   ```

2. Run the LangChain log replay evaluation:
   ```bash
   promptfoo eval -c promptfooconfig.yaml -o results/langchain-replay.json
   ```

3. View results in web UI:
   ```bash
   promptfoo view results/langchain-replay.json
   ```

## What the Tests Check

### Conversation Quality Analysis
- **Order Status**: Verifies agent provides tracking information and shipment details
- **Address Changes**: Checks that agent explains the process and asks for order number
- **Returns**: Validates return policy explanation and clear next steps
- **Refunds**: Ensures clear communication about processing times by payment method

### Chain Execution Analysis
- **Input/Output Flow**: Validates that chain inputs and outputs are properly captured
- **Execution Sequence**: Verifies the logical flow of chain operations

### Tool Usage Analysis
- **Tool Integration**: Confirms tools are called with correct parameters
- **Tool Results**: Validates that tool outputs are properly incorporated into responses

### Performance and Metadata
- **Model Tracking**: Verifies that model information (gpt-4) is preserved
- **Latency Analysis**: Checks that response times are captured
- **Token Usage**: Validates token consumption tracking
- **Tool Call Counting**: Ensures tool usage is properly tracked

## Understanding Results

In the promptfoo web UI, you'll see:
- ✅ **Conversation quality scores** for user experience
- 📊 **Performance metrics** including latency and token usage from LangChain
- 🔧 **Tool usage patterns** showing integration effectiveness
- 🏷️ **Metadata insights** including models used, chain execution counts, and session details
- 🔗 **Cross-session analysis** for consistent service quality

## Production Integration

To use this with your real LangChain logs:

### Step 1: Configure LangChain Logging
Ensure your LangChain application logs the required events:
```python
from langchain.callbacks import LangChainTracer
from langchain.callbacks.manager import CallbackManager

# Set up structured logging
callback_manager = CallbackManager([
    LangChainTracer(
        session_name="production",
        log_file="langchain-logs.jsonl"
    )
])
```

### Step 2: Export Logs
Export your LangChain execution logs in JSONL format with required fields:
- `timestamp`: ISO 8601 timestamp
- `type`: Event type (chain_start, chain_end, llm_start, llm_end, tool_start, tool_end)
- `data`: Event-specific data (inputs, outputs, tool info)
- `metadata`: Session ID and additional context

### Step 3: Update Configuration
```yaml
providers:
  - id: file://langchain-replay-provider.js
    config:
      logFile: './your-production-logs.jsonl'

tests:
  - vars:
      sessionId: 'your_session_id'
      mode: 'conversation'
    # Add your domain-specific assertions
```

## Benefits of LangChain Log Replay

1. **Rich Context**: Preserves complete execution flow including tools and chains
2. **Performance Analysis**: Tracks latency, tokens, and model usage from production
3. **Tool Validation**: Verifies that tools are called correctly and results are used
4. **Chain Debugging**: Identifies issues in multi-step conversation flows
5. **Production Insights**: Analyzes real user interactions with complex agent workflows

## Common LangChain Integration Patterns

| Pattern | Use Case | Key Events |
|---------|----------|------------|
| **Simple Chat** | Direct user-agent conversation | chain_start, llm_start, llm_end, chain_end |
| **Tool-Enhanced** | Agent with function calling | + tool_start, tool_end |
| **Multi-Chain** | Complex workflows | Multiple chain_start/end pairs |
| **RAG Systems** | Retrieval augmented generation | + retrieval tool events |
| **Agent Workflows** | Planning and execution agents | Chain nesting and decision points |

This approach transforms LangChain from an execution framework into a comprehensive conversation analysis and quality assurance system, providing deep insights into production agent behavior.