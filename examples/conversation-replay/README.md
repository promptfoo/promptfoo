# Conversation Replay Example

This example demonstrates how to replay production conversations from logs using promptfoo's custom provider system.

## Overview

This workflow allows you to:
- Replay historical conversations without re-running models
- Use promptfoo's assertions to detect patterns and policy violations
- Analyze conversation quality and customer service effectiveness

## Files

- `production-logs.jsonl` - Sample production conversation logs in JSONL format
- `conversation-replay-provider.js` - Custom provider that reads logs and returns historical responses
- `promptfooconfig.yaml` - Configuration for replay evaluation
- `README.md` - This file

## Sample Data

The production logs contain three realistic customer service conversations:
1. **Password Reset** (`sess_pwd_001`) - Customer forgets password, agent helps with secure reset
2. **Subscription Change** (`sess_cancel_002`) - Customer wants to cancel, agent successfully retains with downgrade
3. **Billing Issue** (`sess_billing_003`) - Duplicate charge, agent processes immediate refund

## Running the Example

1. Install promptfoo if you haven't already:
   ```bash
   npm install -g promptfoo
   ```

2. Run the replay evaluation:
   ```bash
   promptfoo eval -c promptfooconfig.yaml -o results/replay.json
   ```

3. View results in web UI:
   ```bash
   promptfoo view results/replay.json
   ```

## What the Tests Check

- **Password Reset Analysis**: Verifies the conversation contains password and reset link mentions
- **Retention Success**: Checks if subscription cancellation was handled with retention tactics
- **Policy Compliance**: Uses LLM-as-judge to verify professional tone and proper procedures
- **Response Quality**: Analyzes specific assistant responses for helpfulness and security practices
- **Billing Resolution**: Ensures billing issues are resolved promptly and professionally

## Understanding the Results

In the promptfoo web UI, you'll see:
- ✅ **Passed assertions** where conversations meet quality standards
- ❌ **Failed assertions** highlighting potential issues
- **LLM rubric scores** providing detailed feedback on conversation quality
- **Metadata** showing conversation details like turn count and timestamps

## Adapting for Your Logs

To use this with your own production logs:

1. **Update log format**: Modify `conversation-replay-provider.js` to parse your log structure
2. **Add conversation IDs**: Update the `conversationId` values in tests to match your data
3. **Customize assertions**: Add domain-specific checks relevant to your use case
4. **Sanitize PII**: Ensure sensitive data is removed before analysis

## Log Format

Each line in `production-logs.jsonl` follows this structure:
```json
{
  "session_id": "sess_pwd_001",
  "role": "user|assistant",
  "message": "conversation text",
  "timestamp": "2024-01-15T09:30:00Z",
  "user_id": "user_12345",
  "metadata": {"additional": "context"}
}
```

This format can be adapted to match your production logging structure.