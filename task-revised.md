# Guide: Replaying and Re-evaluating Production User Data in Promptfoo (Using Existing Features)

## Overview

This guide shows how to use **existing promptfoo features** to replay and re-evaluate real production conversations for debugging, regression testing, and optimization analysis. No modifications to promptfoo's source code required.

**Core Value Proposition**: Leverage promptfoo's advanced assertion system (LLM-as-judge, regex, contains, JSON validation) to systematically analyze production agent behavior and identify optimization opportunities.

## Why This Matters

**Production AI systems fail in ways you can't predict from synthetic tests.** Real user conversations reveal:
- Edge cases that break your agent
- Performance degradation patterns
- Policy violations in production responses
- Opportunities for prompt optimization
- Regression detection between model versions

**Promptfoo's evaluation framework is perfect for this analysis** - you just need to get your production data into the right format.

## Two Practical Workflows

### Workflow 1: Replay Logs for Investigation
**Use Case**: Browse, investigate, and analyze production conversations without re-running models
**Method**: Custom provider that reads logs and returns historical responses
**Value**: Use promptfoo's assertions to detect patterns, policy violations, or quality issues in production data

### Workflow 2: Re-evaluate User Data (Regression Testing)
**Use Case**: Test new models/prompts against real user inputs from production
**Method**: Convert logs to dataset → feed into current model → compare with assertions
**Value**: Systematic regression testing and A/B comparison using real user scenarios

## Workflow 1: Replay Logs for Investigation

### Example Structure
```
examples/conversation-replay/
├── production-logs.jsonl          # Sample production conversation logs
├── conversation-replay-provider.js # Custom provider that reads logs
├── promptfooconfig.yaml           # Configuration for replay evaluation
└── README.md                      # Quickstart instructions
```

### Sample Production Logs (`production-logs.jsonl`)
```jsonl
{"session_id":"sess_123","role":"user","message":"How do I reset my password?","timestamp":"2024-01-01T10:00:00Z"}
{"session_id":"sess_123","role":"assistant","message":"I can help you reset your password. Please provide your email address.","timestamp":"2024-01-01T10:00:01Z"}
{"session_id":"sess_123","role":"user","message":"john@example.com","timestamp":"2024-01-01T10:00:15Z"}
{"session_id":"sess_123","role":"assistant","message":"Thanks! I've sent a reset link to john@example.com","timestamp":"2024-01-01T10:00:18Z"}
{"session_id":"sess_456","role":"user","message":"Cancel my subscription","timestamp":"2024-01-01T11:00:00Z"}
{"session_id":"sess_456","role":"assistant","message":"I can help with that. Can you confirm your account email?","timestamp":"2024-01-01T11:00:02Z"}
```

### Custom Provider (`conversation-replay-provider.js`)
```javascript
const fs = require('fs');

class ConversationReplayProvider {
  constructor(options) {
    this.config = options.config;
    this.conversations = this.loadConversations();
  }

  id() {
    return 'conversation-replay';
  }

  loadConversations() {
    const logFile = this.config.logFile;
    const rawData = fs.readFileSync(logFile, 'utf8');
    const lines = rawData.split('\n').filter(line => line.trim());

    const conversations = {};
    for (const line of lines) {
      const entry = JSON.parse(line);
      const sessionId = entry.session_id;

      if (!conversations[sessionId]) {
        conversations[sessionId] = [];
      }

      conversations[sessionId].push({
        role: entry.role,
        content: entry.message,
        timestamp: entry.timestamp
      });
    }

    return conversations;
  }

  async callApi(prompt, context) {
    const conversationId = context?.vars?.conversationId;
    const mode = context?.vars?.mode || 'full';
    const turnIndex = context?.vars?.turnIndex || 0;

    if (!conversationId || !this.conversations[conversationId]) {
      return {
        output: `No conversation found for ID: ${conversationId}`,
        error: 'Conversation not found'
      };
    }

    const conversation = this.conversations[conversationId];

    // Return specific turn
    if (mode === 'turn') {
      const turn = conversation[turnIndex];
      return {
        output: turn ? turn.content : 'Turn not found',
        metadata: {
          role: turn?.role,
          timestamp: turn?.timestamp,
          turnIndex,
          totalTurns: conversation.length
        }
      };
    }

    // Return full conversation
    const conversationText = conversation
      .map((turn, idx) => `[Turn ${idx + 1}] ${turn.role}: ${turn.content}`)
      .join('\n---\n');

    return {
      output: conversationText,
      metadata: {
        conversationId,
        totalTurns: conversation.length,
        firstMessage: conversation[0]?.timestamp
      }
    };
  }
}

module.exports = ConversationReplayProvider;
```

### Configuration (`promptfooconfig.yaml`)
```yaml
providers:
  - file://conversation-replay-provider.js
    config:
      logFile: './production-logs.jsonl'

tests:
  # Analyze password reset conversations
  - description: 'Password reset conversation analysis'
    vars:
      conversationId: 'sess_123'
      mode: 'full'
    assert:
      - type: contains
        value: 'password'
      - type: contains
        value: 'reset link'
      - type: not-contains
        value: 'I am an AI' # Generic AI disclaimer
      - type: llm-rubric
        value: 'Does this conversation successfully help the user reset their password?'

  # Check for policy violations across multiple conversations
  - description: 'Policy compliance check'
    vars:
      conversationId: '{{ item }}'
      mode: 'full'
    matrix:
      - item: ['sess_123', 'sess_456', 'sess_789']
    assert:
      - type: not-contains
        value: '<redacted>' # Should be sanitized before this point
      - type: llm-rubric
        value: 'Does this conversation follow customer service policies? Check for: professional tone, no personal information shared inappropriately, accurate information provided.'

  # Analyze specific assistant responses
  - description: 'Assistant response quality'
    vars:
      conversationId: 'sess_123'
      mode: 'turn'
      turnIndex: 1 # Second message (assistant response)
    assert:
      - type: llm-rubric
        value: 'Is this response helpful, professional, and actionable?'
```

### Quickstart
```bash
# Run the replay evaluation
promptfoo eval -c promptfooconfig.yaml -o results/replay.json

# View results in web UI
promptfoo view results/replay.json
```

## Workflow 2: Re-evaluate User Data (Regression Testing)

### Example Structure
```
examples/re-eval-user-data/
├── logs.csv                       # Production data as dataset
├── prompt.json                    # Chat prompt template
├── promptfooconfig.yaml           # Configuration for re-evaluation
└── README.md                      # Quickstart instructions
```

### Production Dataset (`logs.csv`)
```csv
session_id,input,last_assistant,category,expected_outcome
sess_123,"How do I reset my password?","I can help you reset your password...","password_reset","successful"
sess_456,"Cancel my subscription","I can help with that. Can you confirm...","cancellation","successful"
sess_789,"What is your refund policy?","Our refund policy states...","policy_question","successful"
sess_101,"Transfer me to human","I understand you'd like to speak...","escalation","successful"
```

### Chat Prompt Template (`prompt.json`)
```json
[
  {
    "role": "system",
    "content": "You are a helpful customer service assistant. Provide accurate, professional, and actionable responses to customer inquiries."
  },
  {
    "role": "user",
    "content": "{{input}}"
  }
]
```

### Configuration (`promptfooconfig.yaml`)
```yaml
providers:
  # Current model for comparison
  - id: openai:gpt-4o-mini
    config:
      temperature: 0  # Deterministic for regression testing

  # Baseline model for A/B testing (optional)
  - id: openai:gpt-3.5-turbo
    config:
      temperature: 0

prompts:
  - file://prompt.json

tests:
  # Load production data and test each input
  - dataset: file://logs.csv
    assert:
      # Quality checks
      - type: not-contains
        value: 'I am an AI' # No generic disclaimers
      - type: not-contains
        value: 'I cannot help' # Should be helpful

      # Category-specific assertions
      - type: javascript
        value: |
          if (vars.category === 'password_reset') {
            return output.toLowerCase().includes('reset') || output.toLowerCase().includes('password');
          }
          if (vars.category === 'cancellation') {
            return output.toLowerCase().includes('cancel') || output.toLowerCase().includes('subscription');
          }
          return true; // Pass for other categories

      # Overall quality rubric
      - type: llm-rubric
        value: |
          Evaluate this customer service response for:
          1. Helpfulness - Does it address the customer's request?
          2. Professionalism - Is the tone appropriate?
          3. Accuracy - Is the information correct?
          4. Actionability - Does it provide clear next steps?

          Rate as PASS if it meets all criteria, FAIL otherwise.

# Optional: Test specific categories
prompts:
  - file://prompt.json

tests:
  # Focus on password reset conversations
  - dataset: file://logs.csv
    filter:
      category: 'password_reset'
    assert:
      - type: contains
        value: 'reset'
      - type: llm-rubric
        value: 'Does this response help the user reset their password effectively?'
```

### Quickstart
```bash
# Run regression test against current model
promptfoo eval -c promptfooconfig.yaml -o results/current.json

# Compare with previous baseline (if you have it)
promptfoo view results/baseline.json results/current.json

# Or just view current results
promptfoo view results/current.json
```

## Multi-turn Conversation Handling

For multi-turn conversations, represent the history as a variable and use chat-format prompts:

### Modified Dataset (`logs-multiturn.csv`)
```csv
session_id,history,input,category
sess_123,"[{""role"":""user"",""content"":""How do I reset my password?""},{""role"":""assistant"",""content"":""I can help you reset your password. Please provide your email address.""}]","john@example.com","password_reset"
```

### Multi-turn Prompt (`prompt-multiturn.json`)
```json
[
  {
    "role": "system",
    "content": "You are a helpful customer service assistant."
  },
  "{{#each (parseJSON history)}}",
  {
    "role": "{{role}}",
    "content": "{{content}}"
  },
  "{{/each}}",
  {
    "role": "user",
    "content": "{{input}}"
  }
]
```

## Data Sanitization (Critical for Production Data)

Before using production logs, sanitize PII:

```javascript
// sanitize-logs.js
function sanitizeLine(line) {
  const entry = JSON.parse(line);

  // Redact email addresses
  entry.message = entry.message.replace(/\S+@\S+\.\S+/g, '[EMAIL_REDACTED]');

  // Redact phone numbers
  entry.message = entry.message.replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE_REDACTED]');

  // Redact credit card numbers
  entry.message = entry.message.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]');

  return JSON.stringify(entry);
}

// Usage: node sanitize-logs.js < raw-logs.jsonl > production-logs.jsonl
```

## OTLP Path (Advanced, Optional)

If your production system already exports OpenTelemetry traces:

### Enable OTLP Receiver
```yaml
# promptfooconfig.yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
```

### Send Traces to Promptfoo
```bash
# Verify OTLP receiver is running
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'
```

### Custom Provider to Query Traces
```javascript
// otlp-replay-provider.js
const Database = require('better-sqlite3');

class OTLPReplayProvider {
  constructor(options) {
    // Connect to promptfoo's database
    this.db = new Database('.promptfoo/promptfoo.db', { readonly: true });
  }

  async callApi(prompt, context) {
    const sessionId = context?.vars?.sessionId;

    // Query spans with conversation attributes
    const spans = this.db.prepare(`
      SELECT * FROM spans
      WHERE json_extract(attributes, '$.conversation_session_id') = ?
      ORDER BY start_time
    `).all(sessionId);

    // Reconstruct conversation from spans
    const messages = spans.map(span => {
      const attrs = JSON.parse(span.attributes);
      return `${attrs['conversation.role']}: ${attrs['conversation.content']}`;
    });

    return {
      output: messages.join('\n---\n'),
      metadata: { spanCount: spans.length, sessionId }
    };
  }
}
```

## Assertions for Production Analysis

### Common Quality Checks
```yaml
assert:
  # Response quality
  - type: not-contains
    value: 'As an AI' # Generic disclaimers
  - type: not-contains
    value: 'I cannot' # Unhelpful responses
  - type: contains
    value: '{{expected_keyword}}' # Domain-specific terms

  # Structured output validation
  - type: is-json
  - type: json-schema
    value:
      type: object
      required: ['action', 'response']

  # Similarity to expected response (when available)
  - type: similarity
    threshold: 0.8
    value: '{{expected_response}}'

  # Custom quality rubric
  - type: llm-rubric
    value: |
      Rate this customer service response on:
      1. Helpfulness (addresses the request)
      2. Professionalism (appropriate tone)
      3. Accuracy (correct information)
      4. Compliance (follows company policies)

      Provide specific feedback on any issues.
```

## Operational Best Practices

### Cost Control
```yaml
# Sample subset for initial testing
tests:
  - dataset: file://logs.csv
    options:
      maxConcurrency: 5  # Limit parallel requests
      repeat: 1          # Single run only
    # Add sampling for large datasets
    transform: |
      // Sample 10% of data
      Math.random() < 0.1 ? vars : null
```

### Deterministic Results
```yaml
providers:
  - openai:gpt-4o-mini
    config:
      temperature: 0    # Deterministic responses
      seed: 12345       # Consistent randomness
      max_tokens: 500   # Consistent length limits
```

### Caching for Efficiency
```yaml
# Enable caching for repeated evaluations
defaultTest:
  options:
    cache: true
```

## SEO-Optimized Keywords

This guide targets these search queries:
- **"replay production AI conversations"** - Primary workflow
- **"evaluate production chatbot data"** - Re-evaluation use case
- **"debug AI agent failures"** - Problem-solving focus
- **"regression testing AI models"** - A/B comparison workflow
- **"production AI conversation analysis"** - Analytical use case
- **"AI agent quality assurance"** - Quality monitoring
- **"customer service bot debugging"** - Specific domain

## Limitations

- **Tool/Function Calls**: Replay works as-is, but re-evaluation will differ unless you emulate the tools
- **Streaming Responses**: Only final messages are captured in most log formats
- **Token-level Analysis**: Focus on final outputs, not intermediate reasoning steps
- **Real-time Evaluation**: This approach works on static log exports, not live streams
- **PII Tradeoffs**: Sanitization can change model behavior; apply consistently across comparisons

## Value Delivered

**Immediate**: Use promptfoo's assertion system to systematically analyze production AI behavior
**Regression Testing**: Detect quality degradation when upgrading models or changing prompts
**Optimization**: Identify conversation patterns that need improvement
**Debugging**: Root-cause analysis of production failures using real user data
**Compliance**: Systematic review of agent responses for policy adherence

This approach transforms promptfoo from a pre-deployment evaluation tool into a **production quality assurance platform** using only existing features and configuration patterns.