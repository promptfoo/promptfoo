# azure/foundry-agent (Azure AI Foundry Agent)

Run evals against an existing Foundry agent:

## Setup

```bash
npx promptfoo@latest init --example azure/foundry-agent
cd azure/foundry-agent
npm install promptfoo
az login
```

A standard install includes the Azure packages for the local CLI. If you omitted optional dependencies, Promptfoo 0.125.1 and other builds that load `@azure/ai-projects` need `npm install @azure/ai-projects @azure/identity`. For builds that load the REST client instead, use `npm install @azure-rest/core-client @azure/identity` in the same directory.

In `promptfooconfig.yaml`, replace `my-foundry-agent` with your agent's name and `config.projectUrl` with the endpoint from your Foundry project overview.

To use an environment variable instead, remove `config.projectUrl` from the file and set:

```bash
export AZURE_AI_PROJECT_URL="https://your-resource.services.ai.azure.com/api/projects/your-project"
```

Then run the eval:

```bash
npx promptfoo eval --no-cache
```

The provider also supports service principals, workload identity, and managed identity through `DefaultAzureCredential`. See the [Foundry provider reference](https://www.promptfoo.dev/docs/providers/azure/#azure-ai-foundry-agents) for authentication, request options, function callbacks, and execution limits.
