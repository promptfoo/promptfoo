# copilot-agent (Microsoft Copilot Agent)

You can run this example with:

```bash
npx promptfoo@latest init --example copilot-agent
```

## Prerequisites

1. A published Microsoft Copilot Studio agent
2. An Azure Entra ID app registration with `CopilotStudio.Copilots.Invoke` permission
3. Install the required packages:

```bash
npm install @microsoft/agents-copilotstudio-client @microsoft/agents-activity @azure/identity
```

## Setup

Set the following environment variables:

```bash
export COPILOT_AGENT_ENVIRONMENT_ID=your-environment-id
export COPILOT_AGENT_TENANT_ID=your-tenant-id
export COPILOT_AGENT_CLIENT_ID=your-client-id
export COPILOT_AGENT_CLIENT_SECRET=your-client-secret
```

Update the agent schema name in `promptfooconfig.yaml` (replace `hr-assistant` with your agent's schema name).

## Run

```bash
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`.
