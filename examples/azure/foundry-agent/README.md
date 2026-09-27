# azure/foundry-agent (Azure AI Foundry Agent)

Run evals against an existing Foundry agent:

```bash
npx promptfoo@latest init --example azure/foundry-agent
cd azure/foundry-agent
npm install @azure/ai-projects @azure/identity
az login
```

In `promptfooconfig.yaml`, replace `my-foundry-agent` with your agent's name and `config.projectUrl` with the endpoint from your Foundry project overview.

To use an environment variable instead, remove `config.projectUrl` from the file and set:

```bash
export AZURE_AI_PROJECT_URL="https://your-resource.services.ai.azure.com/api/projects/your-project"
```

Then run the eval:

```bash
npx promptfoo@latest eval --no-cache
```

The provider also supports service principals, workload identity, and managed identity through `DefaultAzureCredential`. See the [Foundry provider reference](https://www.promptfoo.dev/docs/providers/azure/#azure-ai-foundry-agents) for authentication, request options, function callbacks, and execution limits.

<details>
<summary>Live QA from a Promptfoo source checkout</summary>

This command runs text, structured-output, and function-tool evals against an existing test project and agent. It makes at most nine client Responses requests, with retries disabled and a three-minute limit per CLI process. Azure may make additional model calls internally. It does not create Azure resources.

From the repository root, preview the configs without contacting Azure:

```bash
npx tsx scripts/azureFoundryLiveQa.ts --dry-run \
  --endpoint https://your-resource.services.ai.azure.com/api/projects/your-project \
  --agent your-existing-agent
```

Sign in with `az login` or another supported identity, then replace `--dry-run` with `--live`. Each run saves sanitized JSON results, callback counts, and local traces in a new directory. It uses the local CLI with `--no-cache` and stops on a provider error. Inspect the results and `summary.json` for failed assertions or errors.

The endpoint must use HTTPS on port 443, the hostname `<resource>.services.ai.azure.com` or `<resource>.services.ai.azure.us` ([Azure Government](https://learn.microsoft.com/en-us/azure/foundry/concepts/foundry-azure-government)), and the path `/api/projects/<project>`. For Private Link, use the normal resource hostname with [private DNS configured](https://learn.microsoft.com/en-us/azure/foundry/how-to/configure-private-link#apply-dns-changes-for-private-endpoints).

</details>
