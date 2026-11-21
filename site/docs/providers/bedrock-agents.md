---
title: AWS Bedrock Agents
description: Evaluate Amazon Bedrock Agents Classic with AWS authentication, ordered conversations, memory identifiers, knowledge-base overrides, and native agent traces.
sidebar_label: AWS Bedrock Agents
---

# AWS Bedrock Agents

The `bedrock-agent:` provider evaluates existing Amazon Bedrock Agents Classic deployments through [`InvokeAgent`](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html).

:::note Service availability

AWS has [closed Agents Classic to new customers](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-classic-maintenance-mode.html). Existing customers can continue using it. This provider does not invoke AgentCore Runtime or create agents; see AWS's migration guidance when selecting a service for a new deployment.

:::

## Prerequisites

- An existing Agents Classic deployment with an active alias.
- If your promptfoo install omits optional dependencies, install `@aws-sdk/client-bedrock-agent-runtime` alongside promptfoo.
- Caller IAM permission for `bedrock:InvokeAgent` on the agent alias.

## Basic Configuration

```yaml
providers:
  - id: bedrock-agent:YOUR_AGENT_ID
    config:
      agentAliasId: YOUR_ALIAS_ID
      region: us-east-1
prompts:
  - '{{query}}'
tests:
  - vars:
      query: How do I reset my password?
    assert:
      - type: regex
        value: '\S'
```

Replace both placeholders with IDs from the deployed agent. An alias name is not an alias ID.

## Full Configuration Options

These options affect the runtime request:

```yaml
providers:
  - id: bedrock-agent:YOUR_AGENT_ID
    config:
      agentAliasId: YOUR_ALIAS_ID
      region: us-east-1
      enableTrace: true
      # Set BEDROCK_SESSION_ID to share a session across ordered turns.
      # sessionId: '{{env.BEDROCK_SESSION_ID}}'
      endSession: false
      # Optional: enable memory on the deployed agent first.
      memoryId: customer-123
      sessionState:
        sessionAttributes:
          userId: customer-123
        promptSessionAttributes:
          department: support
      knowledgeBaseConfigurations:
        - knowledgeBaseId: YOUR_KB_ID
          retrievalConfiguration:
            vectorSearchConfiguration:
              numberOfResults: 5
              overrideSearchType: HYBRID
              filter:
                equals:
                  key: category
                  value: technical
```

`agentId` can also be set in `config`. The provider accepts AWS credential options described under [Authentication](#authentication). `sessionState.invocationId` and `sessionState.returnControlInvocationResults` can supply results to an existing return-control invocation, but the provider does not automatically execute caller-side tools.

Legacy `inferenceConfig`, root-level sampling controls, `guardrailConfiguration`, `promptOverrideConfiguration`, `actionGroups`, and `inputDataConfig` keys are accepted for compatibility but omitted from runtime requests by the AWS SDK. Configure those features on the deployed agent.

## Features

### Session Management

By default each call gets a fresh session. Set one `sessionId` for an ordered conversation, use `maxConcurrency: 1`, and disable caching. The following example reads the session ID from the environment. Generate it once for each evaluation so earlier runs cannot influence the result.

```yaml
providers:
  - id: bedrock-agent:YOUR_AGENT_ID
    config:
      agentAliasId: YOUR_ALIAS_ID
      region: us-east-1
      sessionId: '{{env.BEDROCK_SESSION_ID}}'
prompts:
  - '{{query}}'
evaluateOptions:
  maxConcurrency: 1
  cache: false
tests:
  - vars:
      query: My order number is 12345. Please remember it.
  - vars:
      query: What is my order number?
    assert:
      - type: contains
        value: '12345'
```

```bash
BEDROCK_SESSION_ID="$(node -p 'crypto.randomUUID()')" promptfoo eval -o results.json
```

Do not share a fixed session ID across unrelated or concurrent test cases. Set `endSession: true` on a separate final invocation when you intend to end a conversation; setting it on every call prevents continuation.

### Memory Across Sessions {#memory-types}

`memoryId` is a user-specific identifier, not a choice between short-term and long-term memory. [Enable memory on the deployed agent](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-memory.html), then reuse the same identifier for that user's conversations:

```yaml
config:
  agentAliasId: YOUR_ALIAS_ID
  memoryId: customer-123
```

Within-session context comes from `sessionId`. Persistent session summaries are generated asynchronously after `endSession: true` or the agent's idle timeout. A same-session recall test verifies conversation continuity; cross-session memory requires a new session with the same memory ID after summarization completes. Avoid reusing a memory ID across different users.

### Knowledge Base Integration

Associate the knowledge base with the deployed agent first. `knowledgeBaseConfigurations` entries with `retrievalConfiguration` override retrieval settings at runtime. An entry containing only `knowledgeBaseId` uses the deployed settings and is omitted from the override request.

Use AWS's [RetrievalFilter](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_RetrievalFilter.html) format. Flat metadata maps are rejected locally; combine conditions with `andAll` or `orAll`:

```yaml
config:
  knowledgeBaseConfigurations:
    - knowledgeBaseId: YOUR_KB_ID
      retrievalConfiguration:
        vectorSearchConfiguration:
          numberOfResults: 10
          filter:
            andAll:
              - equals:
                  key: documentType
                  value: manual
              - equals:
                  key: product
                  value: widget-pro
```

### Native Runtime Controls and Results

Agent Runtime requires AWS credentials (SigV4). Bedrock API keys are unsupported and
do not override a configured AWS profile or the default credential chain.

The provider forwards `streamingConfigurations` (`streamFinalResponse` and
`applyGuardrailInterval`), `promptCreationConfigurations`,
`bedrockModelConfigurations`, and `sourceArn` using the
[InvokeAgent request shapes](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html).
The full `sessionState` is supported, including conversation history, input files,
Knowledge Base overrides, and return-control results. In JSON/YAML, encode input-file
`source.byteContent.data` and return-control `responseBody.*.images[].source.bytes`
as canonical padded or unpadded base64. Programmatic configs may use `Buffer` or
`Uint8Array`; other native binary types are unsupported. Supported bytes survive
saved-eval retries. Malformed base64 is rejected before invocation.

Promptfoo and the AWS SDK make a single attempt for each `InvokeAgent` turn,
regardless of `streamFinalResponse` or `AWS_BEDROCK_MAX_RETRIES`. A connection
can fail after the agent has performed an action. Cancelling the eval aborts
the request and stops reading the stream. Actions already performed can still take effect.

Response metadata preserves the session and memory IDs, citations, traces,
`returnControl` events, and generated `files`. Returned file `bytes` are base64
strings. If the agent returns control without text, the eval output contains the
return-control events as JSON; Promptfoo does not execute those requested actions.
To resume, supply the same `sessionId` and the returned `invocationId` and
`returnControlInvocationResults` in `sessionState`. Explicit session/memory calls,
session-ending requests, tracing, return-control turns, knowledge base overrides, and S3
locations bypass the response cache. Cached outputs omit resumable session/memory IDs.
Use `--no-cache` when switching AWS identities or starting a conversation you intend to continue.

Programmatic calls can set `bustCache: true` in the call context to bypass both cache
reads and writes. Legacy `debug: true` has the same effect unless `bustCache` is set
explicitly.

With `PROMPTFOO_STRIP_RESPONSE_OUTPUT=true`, `trace`, `citations`, `returnControl`,
`files`, and `retrievalResults` are reserved output metadata keys and are
removed from exports and shares even if a hook changes their values. Use a separate
metadata key for hook annotations. Metadata explicitly supplied by a test case is preserved, including when a provider
returns the same metadata key.

All agent stream exception events become provider errors. With tracing enabled,
a returned guardrail trace with action `INTERVENED` also sets
`response.guardrails.flagged`.

### Action Groups (Tools)

Configure action groups, their schemas, and Lambda executors in the deployed agent. Adding `actionGroups` to provider configuration does not create or enable a tool. For caller-side `RETURN_CONTROL` actions, use a custom orchestration provider if you need to execute the tools and continue automatically.

### Guardrails

Configure guardrails on the deployed agent. `InvokeAgent` does not accept `guardrailConfiguration`, so that provider option does not apply a guardrail. Inspect the agent trace to verify actual behavior; configuration alone is not evidence that a guardrail ran.

### Inference Control

Set inference parameters and prompt overrides when creating or updating the deployed agent. Runtime provider options do not override those settings.

### Trace Information

Set `enableTrace: true` to return AWS-native trace events. A JavaScript assertion can inspect a deployed calculator action group:

```yaml
assert:
  - type: javascript
    value: |
      return context.providerResponse?.metadata?.trace?.some(event =>
        event.trace?.orchestrationTrace?.invocationInput
          ?.actionGroupInvocationInput?.actionGroupName === 'calculator'
      ) ?? false;
```

The assertion fails if the expected trace is absent. Match the action-group name to your deployment. AWS-native `context.providerResponse.metadata.trace` is separate from promptfoo's OpenTelemetry `context.trace`; see [promptfoo tracing](/docs/tracing/) for OTEL workflow checks.

## Authentication

The provider uses the AWS SDK default credential chain, including `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, IAM roles, and shared AWS CLI profiles. To choose a profile:

```bash
AWS_PROFILE=my-bedrock-profile promptfoo eval --no-cache -o results.json
```

Omit `config.profile` when selecting a profile this way. The native provider's `config.profile` option uses the SSO-specific loader and requires a configured, active SSO session. Explicit `accessKeyId`, `secretAccessKey`, and optional `sessionToken` are also accepted; keep credentials in environment variables rather than committed configuration.

## Response Format

```typescript
{
  output: string;
  metadata?: {
    sessionId?: string;
    memoryId?: string; // Identifier supplied for the user's memory
    trace?: Array<any>; // AWS-native trace events
  };
  cached?: boolean;
  error?: string;
}
```

## Testing Examples

### Basic Agent Testing

The [single-agent example](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock/agents) pairs each `query` variable with the `{{query}}` prompt. Follow the example's run command to set a fresh session ID and export the per-test results.

### Multi-Turn Conversation Testing

Use the complete configuration in [Session Management](#session-management). A test's `providers` field selects top-level provider IDs or labels; it does not accept inline provider configuration objects.

### Knowledge Base Validation

Ask questions with known answers from your deployed knowledge base and assert on those answers. Enable traces to verify retrieval occurred. Configure document permissions, ingestion, and the knowledge-base association in AWS before running the evaluation.

### Tool Usage Verification

Use the [trace assertion](#trace-information) against a question that should invoke an already-deployed tool. Defining multiple providers evaluates them independently. Supervisor/collaborator relationships must already exist in AWS; the [multiple-agent example](https://github.com/promptfoo/promptfoo/blob/main/examples/amazon-bedrock/agents/promptfooconfig.multi-agent.yaml) does not create them.

## Error Handling

Inspect exported results for provider errors as well as assertion failures. Common AWS errors include `ResourceNotFoundException`, `AccessDeniedException`, `ValidationException`, and `ThrottlingException`. A successful invocation can still fail a behavioral assertion.

## Performance Optimization

For CLI runs, disable caching for conversation, memory, latency, and trace verification with `--no-cache` or `PROMPTFOO_CACHE_ENABLED=false`. For independent deterministic queries, caching is available by default. Limit retrieval with `knowledgeBaseConfigurations[].retrievalConfiguration.vectorSearchConfiguration.numberOfResults`; configure generation limits on the deployed agent.

## Troubleshooting

### Agent Not Responding

Verify both IDs and the region:

```bash
aws bedrock-agent get-agent --region us-east-1 --agent-id YOUR_AGENT_ID
aws bedrock-agent get-agent-alias --region us-east-1 \
  --agent-id YOUR_AGENT_ID --agent-alias-id YOUR_ALIAS_ID
```

Invocation permission applies to the **alias** resource. Replace the region, account, agent, and alias in this [AWS IAM pattern](https://docs.aws.amazon.com/bedrock/latest/userguide/security_iam_id-based-policy-examples-agent.html):

```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeAgent",
  "Resource": "arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT12345/ALIAS12345"
}
```

The agent's service role separately needs permissions to invoke its foundation model and access its tools and data.

### Session/Memory Not Working

Use serial execution and `--no-cache`. Reuse a session ID only for one conversation. For cross-session memory, enable the feature on the deployed agent, reuse the same user memory ID, end the earlier session, and allow time for asynchronous summarization.

### Knowledge Base Not Returning Results

Check that ingestion completed, the deployed agent has access, and retrieval filters match your document metadata:

```bash
aws bedrock-agent list-agent-knowledge-bases --region us-east-1 \
  --agent-id YOUR_AGENT_ID --agent-version DRAFT
```

Use the deployed version instead of `DRAFT` when inspecting an active alias.

## See Also

- [AWS Bedrock provider](./aws-bedrock.md)
- [AWS Agents Classic documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS InvokeAgent API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html)
- [AWS Knowledge Base setup](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [AWS Guardrails configuration](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html)
- [Configuration reference](../configuration/reference.md)
