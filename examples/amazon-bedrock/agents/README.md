# amazon-bedrock/agents (AWS Bedrock Agents Classic)

Evaluate existing Bedrock Agents Classic deployments with promptfoo. AWS has [closed Agents Classic to new customers](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-classic-maintenance-mode.html); existing customers can continue using it. The `bedrock-agent:` provider calls `InvokeAgent`, not AgentCore Runtime.

```bash
npx promptfoo@latest init --example amazon-bedrock/agents
cd amazon-bedrock/agents
```

## Prerequisites

- An existing Agents Classic deployment and its agent and alias IDs.
- AWS credentials with `bedrock:InvokeAgent` permission on that alias.
- If your promptfoo install omits optional dependencies, install `@aws-sdk/client-bedrock-agent-runtime` alongside promptfoo.

Use an IAM role, standard AWS credential environment variables, or a shared profile:

```bash
export AWS_PROFILE=my-bedrock-profile
```

With `AWS_PROFILE`, omit `config.profile`. The native provider's `config.profile` option uses the SSO-specific credential loader.

## Single Agent Example

Replace `YOUR_AGENT_ID` and `YOUR_ALIAS_ID` in `promptfooconfig.yaml`. The command below sets the required `BEDROCK_SESSION_ID` to a new UUID for this run. The four turns run in order with caching disabled. The final turn checks whether the agent remembers the color from the previous turn.

```bash
BEDROCK_SESSION_ID="$(node -p 'crypto.randomUUID()')" \
  npx promptfoo@latest eval -c promptfooconfig.yaml -o results.json
```

Inspect the exported `success`, `score`, `error`, and provider output fields. These assertions evaluate the deployed agent's behavior; a model can fail them even when the integration works.

## Multiple Agent Example

Replace the four agent IDs and alias IDs in `promptfooconfig.multi-agent.yaml` with your deployments:

```bash
npx promptfoo@latest eval -c promptfooconfig.multi-agent.yaml --no-cache -o results.json
```

Each test selects provider **labels**, and each response is graded separately. The complex support question is sent independently to the technical and billing agents. Listing multiple providers does not connect them or create a supervisor. Configure any supervisor/collaborator relationships in AWS before evaluating the supervisor agent.

These tests use separate sessions by default. Sharing a fixed session across unrelated or concurrent tests can mix their conversation histories.

## Sessions, Memory, and Traces

The single-agent example uses one session to test conversation history. To test memory across sessions, [enable memory on the agent](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-memory.html), set a stable `memoryId` for the user, and allow time for the previous session to be summarized.

To inspect tool or knowledge-base use, set `enableTrace: true` and examine `response.metadata.trace`. Configure action groups, guardrails, and inference parameters on the deployed agent.

See the [Bedrock Agents provider guide](https://promptfoo.dev/docs/providers/bedrock-agents/) for the IAM policy, configuration options, and troubleshooting.
