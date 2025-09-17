# Database Export Replay Example

This example demonstrates how to replay conversations from database exports using promptfoo's custom provider system.

## Overview

This workflow allows you to:
- Replay conversations exported from production databases
- Analyze business outcomes and performance metrics
- Validate conversation quality across different channels
- Track escalations, upsells, and customer satisfaction patterns

## Files

- `conversations.json` - Sample database export with structured conversation data
- `database-replay-provider.js` - Custom provider that processes database exports and reconstructs conversations
- `promptfooconfig.yaml` - Configuration for database export replay evaluation
- `README.md` - This file

## Sample Data

The database export contains three realistic customer service conversations from different channels:

1. **Login Troubleshooting** (`db_sess_001`) - Web chat session where customer gets password reset help
2. **Subscription Upgrade** (`db_sess_002`) - Mobile app conversation resulting in successful upsell
3. **Cancellation Request** (`db_sess_003`) - Email-based escalated cancellation due to website issues

Each conversation includes rich database metadata:
- Message IDs, timestamps, and content
- User and agent identifiers
- Channel information (web_chat, mobile_app, email)
- Performance metrics (response times, confidence scores)
- Business outcomes (upsells, resolutions, escalations)

## Database Schema Structure

The JSON export follows a typical conversation database schema:

```json
{
  "session_id": "db_sess_001",
  "user_id": "user_abc123",
  "created_at": "2024-01-15T10:30:00Z",
  "channel": "web_chat",
  "status": "completed",
  "messages": [
    {
      "id": 1001,
      "session_id": "db_sess_001",
      "role": "user|assistant",
      "content": "message text",
      "timestamp": "2024-01-15T10:30:00Z",
      "metadata": {
        "agent_id": "agent_001",
        "response_time_ms": 1200,
        "confidence": 0.95
      }
    }
  ]
}
```

## Replay Modes

The provider supports multiple analysis modes:

### Conversation Mode (Default)
Returns the reconstructed conversation flow:
```yaml
vars:
  sessionId: 'db_sess_001'
  mode: 'conversation'
```

### Analysis Mode
Comprehensive conversation analysis with metrics:
```yaml
vars:
  sessionId: 'db_sess_001'
  mode: 'analysis'
```

### Metadata Mode
Detailed breakdown of database metadata and performance metrics:
```yaml
vars:
  sessionId: 'db_sess_001'
  mode: 'metadata'
```

### SQL Mode
SQL-like representation of the database structure:
```yaml
vars:
  sessionId: 'db_sess_001'
  mode: 'sql'
```

## Running the Example

1. Install promptfoo if you haven't already:
   ```bash
   npm install -g promptfoo
   ```

2. Run the database export replay evaluation:
   ```bash
   promptfoo eval -c promptfooconfig.yaml -o results/database-replay.json
   ```

3. View results in web UI:
   ```bash
   promptfoo view results/database-replay.json
   ```

## What the Tests Check

### Conversation Content Analysis
- **Login Issues**: Verifies agent provides password reset assistance
- **Upgrades**: Checks that pricing and features are clearly communicated
- **Cancellations**: Ensures empathetic handling of frustrated customers

### Database Metadata Validation
- **Performance Metrics**: Response times, conversation duration
- **Channel Tracking**: Proper attribution of conversations to channels
- **Agent Performance**: Individual agent response quality and speed

### Business Outcome Detection
- **Upsell Success**: Identifies successful subscription upgrades
- **Issue Resolution**: Tracks problem resolution effectiveness
- **Escalation Patterns**: Detects conversations requiring human intervention
- **Churn Analysis**: Monitors cancellation conversations and reasons

### Cross-Channel Analysis
- **Quality Consistency**: Ensures service quality across web, mobile, and email
- **Performance Variance**: Compares response times by channel
- **Outcome Distribution**: Analyzes business outcomes by communication method

## Understanding Results

In the promptfoo web UI, you'll see:
- ✅ **Conversation quality scores** across different channels
- 📊 **Business metrics** including upsells, resolutions, and escalations
- ⏱️ **Performance data** like response times and conversation duration
- 🏷️ **Channel analysis** showing quality variance across platforms
- 🎯 **Business outcome tracking** for revenue and satisfaction impact

## Production Integration

To use this with your real database exports:

### Step 1: Export Conversation Data
Export your conversations from your database using SQL:

```sql
-- Export conversations with messages
SELECT
  c.session_id,
  c.user_id,
  c.created_at,
  c.channel,
  c.status,
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'id', m.id,
      'session_id', m.session_id,
      'role', m.role,
      'content', m.content,
      'timestamp', m.timestamp,
      'metadata', m.metadata
    ) ORDER BY m.timestamp
  ) as messages
FROM conversations c
JOIN messages m ON c.session_id = m.session_id
WHERE c.created_at >= '2024-01-01'
GROUP BY c.session_id, c.user_id, c.created_at, c.channel, c.status
ORDER BY c.created_at;
```

### Step 2: Format as JSON
Export the results as JSON array and save to a file:

```bash
# Using PostgreSQL
psql -d your_db -c "COPY (SELECT json_agg(row_to_json(t)) FROM (your_query) t) TO '/path/conversations.json';"

# Using MySQL
mysql -u user -p -D your_db -e "SELECT JSON_ARRAYAGG(JSON_OBJECT(...)) FROM conversations;" > conversations.json
```

### Step 3: Update Configuration
```yaml
providers:
  - id: file://database-replay-provider.js
    config:
      dataFile: './your-conversations.json'

tests:
  - vars:
      sessionId: 'your_session_id'
      mode: 'conversation'
    # Add your domain-specific assertions
```

## Common Database Schema Patterns

| Schema Type | Conversation Storage | Message Storage | Key Features |
|-------------|---------------------|-----------------|--------------|
| **Single Table** | All data in messages table | Same table | Simple, good for small datasets |
| **Separate Tables** | conversations + messages | Normalized structure | Better for large datasets, rich metadata |
| **Document Store** | JSON documents | Nested arrays | Flexible schema, complex queries |
| **Event Stream** | Event log entries | Time-ordered events | Audit trail, real-time analysis |

## Business Metrics Tracked

The provider automatically calculates business-relevant metrics:

- **Upsell Success Rate**: Conversations leading to plan upgrades
- **Resolution Rate**: Issues successfully resolved
- **Escalation Rate**: Conversations requiring human intervention
- **Churn Prevention**: Cancellations avoided through good service
- **Channel Performance**: Service quality by communication method
- **Agent Effectiveness**: Individual agent performance metrics

## Benefits of Database Replay

1. **Business Intelligence**: Extract revenue and satisfaction insights from conversations
2. **Performance Analysis**: Track response times and resolution effectiveness
3. **Quality Assurance**: Ensure consistent service across all channels
4. **Outcome Tracking**: Measure business impact of customer service interactions
5. **Escalation Analysis**: Identify patterns in problematic conversations

This approach transforms your customer service database into a comprehensive quality assurance and business intelligence platform, providing deep insights into both operational performance and business outcomes.