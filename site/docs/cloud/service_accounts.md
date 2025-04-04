---
sidebar_label: Service Accounts 
sidebar_position: 30
title: Creating and Managing Service Accounts in Promptfoo Cloud
description: Learn how to create and manage service accounts in Promptfoo Cloud
keywords: [service accounts, api keys, api, keys, api key, api keys, service account, service accounts, api key, api keys, service account, service accounts, api key, api keys]
---

# Service Accounts

Service accounts allow you to create API keys for programmatic access to Promptfoo Cloud. These are useful for CI/CD pipelines and automated testing. 

:::note
Only global system admins can create and assign service accounts. 
:::

To create a service account:

1. Navigate to your Organization Settings page 
2. Click on the "Users" tab and then select "Create Service Account" 
<div style={{ textAlign: 'center' }}>
    <img src="/img/enterprise-docs/create-service-account.png" style={{ width: '80%' }} />
</div>
3. Enter a name for your service account and save the API key in a secure location. 
<div style={{ textAlign: 'center' }}>
    <img src="/img/enterprise-docs/service-account-api-key.png" style={{ width: '80%' }} />
</div>
:::warning
Make sure to copy your API key when it's first created. For security reasons, you won't be able to view it again after closing the dialog.
:::
4. Determine if you want to assign the API key with global admin privileges. This will provision the API key with access to everything that can be done in the organization settings page, such as managing teams, roles,  users, and webhooks. 
5. Assign the API key to a team by navigating to the "Teams" tab and selecting the team you want to assign the API key to in the "Service Accounts" section. Service account API keys will not have programmatic access to Promptfoo Cloud unless assigned to a team and role. 
<div style={{ textAlign: 'center' }}>
    <img src="/img/enterprise-docs/assign-service-account.png" style={{ width: '80%' }} />
</div>
6. Select the predefined role for the service account for that team. 





