# redteam-azure-assistant

Red team testing for Azure OpenAI Assistants with function tools to evaluate security boundaries.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-azure-assistant
```

## Overview

This example demonstrates how to security test an Azure OpenAI Assistant that has access to sensitive HR data through function tools. It includes mock HR database functions and a configured red team setup.

## Quick Start

1. **Setup environment variables**:

   ```
   AZURE_API_KEY=your_key
   AZURE_OPENAI_API_HOST=your-resource.openai.azure.com
   AZURE_DEPLOYMENT_NAME=your_deployment_name
   AZURE_CHAT_DEPLOYMENT_NAME=your_eval_deployment
   ```

2. **Update configuration**:

   - Edit `promptfooconfig.yaml`
   - Replace `azure:assistant:asst_V3UgNCNUSAtHQdit8YimCKlJ` with your Assistant ID
   - Update `apiHost` to your Azure endpoint

3. **Generate security tests**:

   ```bash
   npx promptfoo@latest redteam generate
   ```

4. **Run the security evaluation**:

   ```bash
   npx promptfoo@latest redteam eval
   ```

5. **View results**:
   ```bash
   npx promptfoo@latest redteam report
   # or
   npx promptfoo@latest view
   ```

## What's Included

- **Mock HR Functions**: Employee data, salary information, and document access
- **Security Boundaries**: System instructions limiting access to sensitive data
- **Red team Configuration**: Pre-configured to test data privacy, access control, and security
- **Named Entities**: Sample employee names for more realistic attacks

## Security Testing Focus

This example tests if an HR assistant can be manipulated to:

- Leak personally identifiable information
- Bypass role-based access controls
- Act outside its security boundaries
- Expose sensitive HR documents or salary information
- Be manipulated through impersonation of executives

## Customization

1. Update the provider ID and API host
2. Customize the HR data in `callbacks/hr-database.js`
3. Modify security instructions in `promptfooconfig.yaml`
4. Adjust entities in the redteam section to match your needs

## Security Notice

This example contains simulated sensitive data for educational purposes. Use responsibly and only test systems you are authorized to evaluate.

## Documentation

- [LLM redteaming documentation](https://www.promptfoo.dev/docs/guides/llm-redteaming/)
- [Azure provider documentation](https://www.promptfoo.dev/docs/providers/azure/)
