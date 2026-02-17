---
title: Microsoft Copilot Agent
description: Evaluate Microsoft Copilot Studio agents using the Activity Protocol SDK
sidebar_label: Microsoft Copilot Agent
---

# Microsoft Copilot Agent

The `copilot-agent` provider allows you to evaluate [Microsoft Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/microsoft-copilot-studio) agents using the Microsoft 365 Agents SDK (Activity Protocol).

## Prerequisites

1. **A Copilot Studio agent** published and available in your Power Platform environment
2. **An Azure Entra ID app registration** with:
   - `CopilotStudio.Copilots.Invoke` API permission
   - A client secret generated for authentication
3. **Install required packages:**

```bash
npm install @microsoft/agents-copilotstudio-client @microsoft/agents-activity @azure/identity
```

## Configuration

Basic configuration using environment variables:

```yaml
providers:
  - id: copilot-agent:my-agent-schema-name
    config:
      environmentId: '{{env.COPILOT_AGENT_ENVIRONMENT_ID}}'
      tenantId: '{{env.COPILOT_AGENT_TENANT_ID}}'
      clientId: '{{env.COPILOT_AGENT_CLIENT_ID}}'
      clientSecret: '{{env.COPILOT_AGENT_CLIENT_SECRET}}'
```

The agent schema name (after the `copilot-agent:` prefix) maps to the agent's `schemaName` in Copilot Studio.

## Config Options

| Option          | Type   | Required | Default            | Description                                        |
| --------------- | ------ | -------- | ------------------ | -------------------------------------------------- |
| `environmentId` | string | Yes      |                    | Power Platform environment ID                      |
| `schemaName`    | string | No       | From provider ID   | Agent schema name (overrides the provider ID name) |
| `tenantId`      | string | Yes      |                    | Azure Entra ID tenant ID                           |
| `clientId`      | string | Yes      |                    | Azure app registration client ID                   |
| `clientSecret`  | string | Yes      |                    | Azure app registration client secret               |
| `timeoutMs`     | number | No       | `120000`           | Request timeout in milliseconds                    |
| `userId`        | string | No       | `'promptfoo-user'` | User ID sent with messages                         |

## Environment Variables

All required config options can be set via environment variables:

| Variable                       | Description                   |
| ------------------------------ | ----------------------------- |
| `COPILOT_AGENT_ENVIRONMENT_ID` | Power Platform environment ID |
| `COPILOT_AGENT_TENANT_ID`      | Azure Entra ID tenant ID      |
| `COPILOT_AGENT_CLIENT_ID`      | Azure app client ID           |
| `COPILOT_AGENT_CLIENT_SECRET`  | Azure app client secret       |

## Authentication

The provider uses Azure Entra ID client credentials flow to acquire a JWT token. It requires:

1. An Azure app registration in your tenant
2. The `CopilotStudio.Copilots.Invoke` API permission granted to the app
3. A client secret for the app

The provider acquires tokens automatically using `@azure/identity`'s `ClientSecretCredential`.

## How It Works

1. The provider acquires a JWT token from Azure Entra ID
2. Creates a `CopilotStudioClient` with the agent's connection settings
3. Starts a streaming conversation with the agent
4. Sends the prompt as a message activity
5. Collects all response message activities
6. Returns the concatenated response text

## Example

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Microsoft Copilot Agent evaluation

providers:
  - id: copilot-agent:hr-assistant
    config:
      environmentId: '{{env.COPILOT_AGENT_ENVIRONMENT_ID}}'
      tenantId: '{{env.COPILOT_AGENT_TENANT_ID}}'
      clientId: '{{env.COPILOT_AGENT_CLIENT_ID}}'
      clientSecret: '{{env.COPILOT_AGENT_CLIENT_SECRET}}'

prompts:
  - '{{query}}'

tests:
  - vars:
      query: 'What is the company holiday policy?'
    assert:
      - type: contains
        value: 'holiday'
      - type: not-empty

  - vars:
      query: 'How do I submit a time-off request?'
    assert:
      - type: not-empty
      - type: latency
        threshold: 30000
```
