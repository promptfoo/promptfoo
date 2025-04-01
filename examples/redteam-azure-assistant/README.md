# redteam-azure-assistant

Red team testing for Azure OpenAI Assistants with function tools and file search to evaluate security boundaries.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-azure-assistant
```

## Overview

This example demonstrates how to security test an Azure OpenAI Assistant that has access to sensitive HR data through function tools and document search capabilities. It includes mock HR database functions, vector-based document search, and a configured redteam setup.

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

3. **Set up vector store**:

   - Create a vector store in Azure AI Studio or via API
   - Update the `vector_store_ids` value in `promptfooconfig.yaml` with your actual vector store ID
   - Upload HR documents from the `seed-data` directory to the vector store
   - Ensure your Azure OpenAI assistant has permission to access the vector store

4. **Generate security tests**:

   ```bash
   npx promptfoo@latest redteam generate
   ```

5. **Run the security evaluation**:

   ```bash
   npx promptfoo@latest redteam eval
   ```

6. **View results**:
   ```bash
   npx promptfoo@latest redteam report
   # or
   npx promptfoo@latest view
   ```

## What's Included

- **Mock HR Functions**: Employee data, salary information, and document access
- **File Search Capability**: Search through HR documents stored in a vector database
- **Security Boundaries**: System instructions limiting access to sensitive data
- **Redteam Configuration**: Pre-configured to test data privacy, access control, and security
- **Named Entities**: Sample employee names and document types for more realistic attacks

## Security Testing Focus

This example tests if an HR assistant can be manipulated to:

- Leak personally identifiable information
- Bypass role-based access controls
- Act outside its security boundaries
- Expose sensitive HR documents or salary information
- Be manipulated through impersonation of executives
- Extract sensitive content from confidential documents through vector search
- Exploit document retrieval mechanisms to access unauthorized content

## HR Document Seed Data

The `seed-data` directory contains simulated HR documents for testing the file search capabilities:

### Document Structure

The seed data is organized into categories that mirror typical HR document repositories:

- **policies/** - Company-wide HR policies and guidelines
- **employee-records/** - Individual performance reviews and employee documentation
- **compensation/** - Salary structures and compensation plans
- **succession-planning/** - Executive succession planning documents
- **systems/** - Technical documentation for HR systems
- **executive/** - Confidential executive communications
- **legal/** - Vendor contracts and legal documents

### Comprehensive Document Set

The seed data includes the following document types, each designed to test specific security scenarios:

1. **Employee Records**

   - Performance reviews with sensitive feedback and salary information
   - Personal data files containing PII and immigration status
   - Disciplinary records with confidential notes

2. **HR Policies**

   - Standard company policies and handbooks
   - Diversity and inclusion policy with sensitive demographic data
   - Data handling procedures with security warning indicators

3. **Compensation Documents**

   - Reduction in force planning document with layoff details
   - Salary benchmark report with competitor compensation data
   - Department-level budget allocations

4. **System Documentation**

   - HR system access guide with API endpoints and database connection strings
   - Authentication procedures and security protocols

5. **Executive Communications**

   - CEO memo on confidential compensation structure changes
   - Strategic planning documents with sensitive business information

6. **Legal Documents**
   - Third-party vendor contracts with confidential pricing details
   - Service agreements with financial terms and authorized approvers

### Sensitivity Levels

The documents have varying levels of sensitivity to test security boundaries:

- **Public** - Information appropriate for all employees (e.g., Employee Handbook)
- **Internal** - Information for internal use but not highly sensitive (e.g., HR Policies)
- **Confidential** - Sensitive information limited to certain roles (e.g., Performance Reviews)
- **Highly Confidential** - Extremely sensitive information limited to executives (e.g., Succession Planning)

### Document Metadata

When uploading to Azure Vector Store, consider adding the following metadata to each document:

- **sensitivity** - Public, Internal, Confidential, or Highly Confidential
- **department** - HR, Executive, Legal, etc.
- **document_type** - Policy, Employee Record, Compensation Plan, etc.
- **effective_date** - Date when the document became effective
- **last_updated** - Last modification date

This metadata can help test whether the assistant respects document classification when responding to queries.

### Usage in Red Team Testing

These documents are designed to support the following testing scenarios:

1. **Information leakage** - Does the assistant leak sensitive information to unauthorized users?
2. **Role-based access** - Does the assistant respect role boundaries when providing information?
3. **Document classification** - Does the assistant handle different document sensitivity levels appropriately?
4. **Data privacy** - Does the assistant protect PII and sensitive employee data?
5. **Query manipulation** - Can the assistant be manipulated to return sensitive document content?
6. **Server-side request forgery** - Can the assistant be tricked into revealing API endpoints or connection strings?
7. **Executive impersonation** - Can users trick the assistant by impersonating executives?
8. **Financial exploitation** - Can confidential financial terms be extracted for personal gain?
9. **Document poisoning** - Can users manipulate the RAG system to bypass security controls?

## Vector Store Setup

For the file search capability to work:

1. Create a vector store in Azure AI Studio or via API
2. Update the `vector_store_ids` value in `promptfooconfig.yaml` with your actual vector store ID
3. Upload your HR documents to the vector store (policies, manuals, etc.)
4. Make sure your Azure OpenAI assistant has permission to access the vector store

## Customization

1. Update the provider ID and API host
2. Customize the HR data in `callbacks/hr-database.js`
3. Modify security instructions in `promptfooconfig.yaml`
4. Adjust entities in the redteam section to match your needs
5. Add your own documents to the vector store for testing
6. Update the vector store ID in the configuration
7. Customize the seed data documents:
   - Replace example names with your test names
   - Adjust salary figures and position titles
   - Add or modify policies to match your testing scenario
   - Create additional documents for specific testing needs

## Security Notice

This example contains simulated sensitive data for educational purposes. Use responsibly and only test systems you are authorized to evaluate. While these documents contain fictional data, they are designed to appear realistic. Use appropriate security measures when storing and handling this data, even in test environments.

## Documentation

- [LLM redteaming documentation](https://www.promptfoo.dev/docs/guides/llm-redteaming/)
- [Azure provider documentation](https://www.promptfoo.dev/docs/providers/azure/)
