# sharepoint-integration (SharePoint Integration Example)

This example demonstrates how to use promptfoo with Microsoft SharePoint to import test cases from CSV files stored in SharePoint.

## Prerequisites

1. Azure AD Application with certificate-based authentication
2. SharePoint site with appropriate permissions
3. Certificate PEM file containing both private key and certificate

## Setup

1. **Copy the environment variables template:**

   ```bash
   cp .env.example .env
   ```

2. **Fill in your SharePoint credentials in `.env`:**
   - `SHAREPOINT_CLIENT_ID` - Your Azure AD application client ID
   - `SHAREPOINT_TENANT_ID` - Your Azure AD tenant ID
   - `SHAREPOINT_CERT_PATH` - Path to your certificate PEM file
   - `SHAREPOINT_BASE_URL` - Your SharePoint base URL

3. **Ensure your CSV file is in SharePoint** with the following format:

   ```csv
   language,input,__expected
   French,Hello world,icontains: bonjour
   German,I'm hungry,llm-rubric: is german
   Swahili,Hello world,similar(0.8):hello world
   ```

4. **Update `promptfooconfig.yaml`** with your SharePoint URL:
   ```yaml
   tests: https://yourcompany.sharepoint.com/sites/yoursite/Shared%20Documents/test-cases.csv
   ```

## Running the Example

```bash
# Install dependencies
npm install

# Scaffold the example
npx promptfoo@latest init --example sharepoint-integration

# Run the eval
npx promptfoo eval
```
