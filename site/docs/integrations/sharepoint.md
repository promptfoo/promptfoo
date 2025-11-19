---
title: SharePoint Integration
sidebar_label: SharePoint
description: Import LLM test cases from Microsoft SharePoint. Configure certificate-based authentication and load test data from SharePoint CSV files.
---

# SharePoint Integration

promptfoo allows you to import eval test cases directly from Microsoft SharePoint CSV files using certificate-based authentication with Azure AD.

## Prerequisites

1. **Install Peer Dependencies**

   ```bash
   npm install @azure/msal-node
   ```

2. **Set Up Azure AD Application**
   - Register an application in [Azure Portal](https://portal.azure.com/) under "Azure Active Directory" > "App registrations"
   - Configure API permissions with SharePoint `Sites.Read.All` permission
   - Set up certificate-based authentication by generating a PEM certificate (containing both private key and certificate) and uploading it to your application
   - Ensure your application has the necessary permissions to access SharePoint sites

   Consult your IT/DevOps team or [Microsoft documentation](https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/register-sharepoint-add-ins) for detailed setup steps.

3. **Configure Environment Variables**

   Set the following environment variables:

   ```bash
   export SHAREPOINT_CLIENT_ID="your-application-client-id"
   export SHAREPOINT_TENANT_ID="your-azure-tenant-id"
   export SHAREPOINT_CERT_PATH="/path/to/sharepoint-certificate.pem"
   export SHAREPOINT_BASE_URL="https://yourcompany.sharepoint.com"
   ```

   Or create a `.env` file in your project root:

   ```bash title=".env"
   SHAREPOINT_CLIENT_ID=your-application-client-id
   SHAREPOINT_TENANT_ID=your-azure-tenant-id
   SHAREPOINT_CERT_PATH=/path/to/sharepoint-certificate.pem
   SHAREPOINT_BASE_URL=https://yourcompany.sharepoint.com
   ```

   :::caution
   Remember to add `.env` to your `.gitignore` file!
   :::

## Importing Test Cases from SharePoint

Once authentication is configured, specify the SharePoint CSV file URL in your configuration:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'SharePoint CSV Import Example'
prompts:
  - 'Please translate the following text to {{language}}: {{input}}'
providers:
  - openai:gpt-5
  - anthropic:claude-sonnet-4-5-20250929
# highlight-start
tests: https://yourcompany.sharepoint.com/sites/yoursite/Shared%20Documents/test-cases.csv
# highlight-end
```

The SharePoint CSV file should be structured with columns that define the test cases:

```csv title="test-cases.csv"
language,input,__expected
French,Hello world,icontains: bonjour
German,I'm hungry,llm-rubric: is german
Swahili,Hello world,similar(0.8):hello world
```

> 💡 For details on CSV structure, refer to [loading assertions from CSV](/docs/configuration/expected-outputs/#load-assertions-from-csv).

## Environment Variables

| Variable               | Description                                             | Required |
| ---------------------- | ------------------------------------------------------- | -------- |
| `SHAREPOINT_CLIENT_ID` | Azure AD application (client) ID from app registration  | Yes      |
| `SHAREPOINT_TENANT_ID` | Azure AD tenant (directory) ID                          | Yes      |
| `SHAREPOINT_CERT_PATH` | Path to PEM file containing private key and certificate | Yes      |
| `SHAREPOINT_BASE_URL`  | Base URL of your SharePoint site                        | Yes      |

## Using Custom Providers for Model-Graded Metrics

When using SharePoint for test cases, you can still use custom providers for model-graded metrics like `llm-rubric` or `similar`. To do this, override the default LLM grader by adding a `defaultTest` property to your configuration:

```yaml
prompts:
  - file://prompt1.txt
  - file://prompt2.txt
providers:
  - openai:gpt-5
  - anthropic:claude-sonnet-4-5-20250929
tests: https://yourcompany.sharepoint.com/sites/yoursite/Shared%20Documents/test-cases.csv
defaultTest:
  options:
    provider:
      text:
        id: ollama:chat:llama3.3:70b
      embedding:
        id: ollama:embeddings:mxbai-embed-large
```

For more details on customizing the LLM grader, see the [model-graded metrics documentation](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).
