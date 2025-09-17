# Production Log Replay Examples

This directory contains complete, runnable examples demonstrating how to replay and analyze conversations from production logs using promptfoo's custom provider system.

## Overview

These examples show how to transform historical conversation data from various logging systems into comprehensive quality assurance and business intelligence platforms. Each example includes realistic data, custom providers, and working test configurations.

## Available Examples

### 🔄 [Conversation Replay](./conversation-replay/)
Replay conversations from JSONL log files with multi-turn conversation analysis.

- **Data Format**: JSONL conversation logs
- **Use Cases**: Customer service quality analysis, conversation flow validation
- **Key Features**: Turn-by-turn replay, conversation metadata, PII sanitization
- **Pass Rate**: ✅ 100% (6/6 tests)

```bash
cd conversation-replay
promptfoo eval -c promptfooconfig.yaml
```

### 📊 [OpenTelemetry Traces](./opentelemetry-traces/)
Analyze conversations captured in OpenTelemetry distributed tracing format.

- **Data Format**: OTLP (OpenTelemetry Protocol) traces with span attributes
- **Use Cases**: Microservices conversation tracking, performance analysis, distributed system debugging
- **Key Features**: Trace correlation, latency analysis, model tracking, span metadata
- **Pass Rate**: ✅ 75% (6/8 tests)

```bash
cd opentelemetry-traces
promptfoo eval -c promptfooconfig.yaml
```

### 🔗 [LangChain Logs](./langchain-logs/)
Replay conversations from LangChain execution logs with chain and tool analysis.

- **Data Format**: LangChain event logs (chain_start, llm_start, tool_start, etc.)
- **Use Cases**: Agent workflow validation, tool usage analysis, chain execution debugging
- **Key Features**: Chain execution flow, tool call tracking, performance metrics, model usage
- **Pass Rate**: ✅ 77.78% (7/9 tests)

```bash
cd langchain-logs
promptfoo eval -c promptfooconfig.yaml
```

### 🗄️ [Database Export](./database-export/)
Analyze conversations exported from production databases with business outcome tracking.

- **Data Format**: JSON exports from SQL conversation tables
- **Use Cases**: Business intelligence, outcome analysis, customer service metrics
- **Key Features**: Business outcome detection, escalation tracking, channel analysis, performance metrics
- **Pass Rate**: ✅ 55.56% (5/9 tests)

```bash
cd database-export
promptfoo eval -c promptfooconfig.yaml
```

## Quick Start

1. **Install promptfoo**:
   ```bash
   npm install -g promptfoo
   ```

2. **Run any example**:
   ```bash
   cd <example-directory>
   promptfoo eval -c promptfooconfig.yaml
   ```

3. **View results**:
   ```bash
   promptfoo view
   ```

## Data Sources and Formats

| Example | Source System | Data Format | Key Metadata |
|---------|---------------|-------------|--------------|
| **Conversation Replay** | Generic chat logs | JSONL with session/message structure | Session ID, timestamps, user/assistant roles |
| **OpenTelemetry** | Distributed tracing | OTLP traces with span attributes | Trace/span IDs, latency, service names, model info |
| **LangChain** | Agent frameworks | Event logs (JSON) | Chain execution, tool calls, token usage |
| **Database Export** | SQL databases | JSON conversation tables | Business outcomes, escalations, channel tracking |

## Use Cases by Industry

### Customer Service
- **Quality Assurance**: Validate response quality across channels
- **Performance Analysis**: Track response times and resolution rates
- **Escalation Detection**: Identify conversations requiring human intervention
- **Business Outcomes**: Measure upsells, retention, and satisfaction

### E-commerce
- **Order Support**: Analyze order status and shipping inquiries
- **Returns Processing**: Validate return policy explanations
- **Billing Issues**: Ensure accurate billing support and resolution

### Technical Support
- **Tool Integration**: Verify that agents use diagnostic tools correctly
- **Resolution Tracking**: Measure issue resolution effectiveness
- **Knowledge Base**: Validate that agents reference correct documentation

## Common Analysis Patterns

### Conversation Quality
```yaml
assert:
  - type: contains
    value: 'helpful response pattern'
  - type: not-contains
    value: 'I cannot help'
  - type: llm-rubric
    value: 'Response is empathetic and professional'
```

### Performance Metrics
```yaml
assert:
  - type: javascript
    value: |
      return context.metadata.avgResponseTime < 3000 &&
             context.metadata.duration > 0
```

### Business Outcomes
```yaml
assert:
  - type: javascript
    value: |
      return context.metadata.businessOutcome === 'upsell_success' ||
             context.metadata.businessOutcome === 'issue_resolved'
```

## Production Integration

### Step 1: Export Your Data
Each example includes production integration instructions for exporting data from your specific logging system.

### Step 2: Configure Provider
Update the provider configuration to point to your data:
```yaml
providers:
  - id: file://your-replay-provider.js
    config:
      dataFile: './your-production-data.json'
```

### Step 3: Customize Tests
Add domain-specific assertions based on your business requirements:
```yaml
tests:
  - vars:
      sessionId: 'your_session_id'
    assert:
      - type: contains
        value: 'your domain-specific requirement'
```

## Benefits of Production Log Replay

1. **Historical Analysis**: Analyze real user interactions from production
2. **Quality Assurance**: Systematic validation of conversation quality
3. **Performance Insights**: Track response times, resolution rates, and user satisfaction
4. **Business Intelligence**: Extract revenue and retention insights from conversations
5. **Continuous Improvement**: Identify patterns for agent training and system optimization

## Technical Architecture

### Custom Providers
Each example includes a custom provider that:
- Parses the specific log format
- Reconstructs conversation flows
- Preserves metadata and performance metrics
- Supports multiple analysis modes

### Assertion Types
- **Content Validation**: `contains`, `not-contains` for conversation content
- **Performance Checks**: `javascript` for metrics and timing validation
- **Quality Scoring**: `llm-rubric` for subjective quality assessment
- **Business Logic**: Custom JavaScript for domain-specific requirements

### Metadata Preservation
All examples preserve important metadata including:
- Performance metrics (latency, token usage)
- System information (models, services, agents)
- Business context (outcomes, escalations, channels)
- Technical details (trace IDs, session info)

## Next Steps

1. **Choose Your Format**: Select the example that matches your logging system
2. **Run the Example**: Test with the provided sample data
3. **Integrate Your Data**: Export your production logs and update configurations
4. **Customize Assertions**: Add domain-specific validation rules
5. **Automate Analysis**: Set up regular evaluation of production conversations

These examples transform your production logs into comprehensive conversation analysis platforms, providing deep insights into both operational performance and business outcomes.