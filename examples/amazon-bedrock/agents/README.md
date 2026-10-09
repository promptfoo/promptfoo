# amazon-bedrock/agents (AWS Bedrock Agents Classic)

Evaluate existing Bedrock Agents Classic deployments with promptfoo. AWS has [closed Agents Classic to new customers](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-classic-maintenance-mode.html); existing customers can continue using it. The `bedrock-agent:` provider calls `InvokeAgent`, not AgentCore Runtime.

```bash
npx promptfoo@latest init --example amazon-bedrock/agents
cd amazon-bedrock/agents
```

## Prerequisites

- An existing Agents Classic deployment and its agent and alias IDs.
- AWS credentials with `bedrock:InvokeAgent` permission on that alias.
- `npm install @aws-sdk/client-bedrock-agent-runtime`.

Use an IAM role, standard AWS credential environment variables, or a shared profile:

```bash
export AWS_PROFILE=my-bedrock-profile
```

With `AWS_PROFILE`, omit `config.profile`. The native provider's `config.profile` option uses the SSO-specific credential loader.

## Single Agent Example

Replace `YOUR_AGENT_ID` and `YOUR_ALIAS_ID` in `promptfooconfig.yaml`. Use a fresh `sessionId` for each run. The four tests form one conversation, with `maxConcurrency: 1` preserving turn order. The final test checks recall of the color supplied in the previous turn.

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o results.json
```

Inspect the exported `success`, `score`, `error`, and provider output fields. These assertions evaluate the deployed agent's behavior; a model can fail them even when the integration works.

## Multiple Agent Example

Replace the four agent IDs and alias IDs in `promptfooconfig.multi-agent.yaml` with your deployments:

```bash
npx promptfoo@latest eval -c promptfooconfig.multi-agent.yaml --no-cache -o results.json
```

Each test selects provider **labels**, and each response is graded separately. The complex support question is sent independently to the technical and billing agents. Listing multiple providers does not connect them or create a supervisor. Configure any supervisor/collaborator relationships in AWS before evaluating the supervisor agent.

These tests use separate sessions by default. Sharing a fixed session across unrelated or concurrent tests can mix their conversation histories.

## Sessions and Memory

`sessionId` continues a conversation. For persistent memory across sessions, first [enable memory on the deployed agent](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-memory.html), then use a stable `memoryId` for the same user:

```yaml
config:
  agentAliasId: YOUR_ALIAS_ID
  sessionId: conversation-001
  memoryId: customer-123
```

`memoryId` is an identifier, not a `SHORT_TERM_MEMORY` / `LONG_TERM_MEMORY` mode switch. End the session with `endSession: true` or let its configured idle timeout elapse. Memory summarization is asynchronous; a same-session recall test does not prove persistence across sessions. Keep caching disabled when testing session state or memory.

## Traces and Deployed Features

Set `enableTrace: true` to return AWS-native trace events in `response.metadata.trace`. A JavaScript assertion can inspect them through `context.providerResponse.metadata.trace`. They are separate from promptfoo's OpenTelemetry traces.

Configure action groups, guardrails, inference parameters, and prompt overrides on the deployed agent. `InvokeAgent` does not apply those definitions from provider configuration. The provider does not execute caller-side tools returned by a `RETURN_CONTROL` action group.

## IAM Permissions

Scope invocation permission to your agent **alias**, replacing the region, account, agent, and alias below:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeAgent",
      "Resource": "arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT12345/ALIAS12345"
    }
  ]
}
```

See [AWS's agent IAM examples](https://docs.aws.amazon.com/bedrock/latest/userguide/security_iam_id-based-policy-examples-agent.html). The deployed agent's service role separately needs permissions for its models, knowledge bases, and tools.

## Troubleshooting

- Verify the agent and alias IDs, region, and deployment status for not-found errors.
- Check caller IAM permissions and service access for authorization errors.
- Use a fresh session ID, serial execution, and `--no-cache` for conversation tests.
- Inspect AWS-native traces when a deployed tool or knowledge base is not used.

See the [Promptfoo Bedrock Agents provider guide](https://promptfoo.dev/docs/providers/bedrock-agents/) and [AWS InvokeAgent reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html).
