---
title: Subprocessors | Promptfoo
description: List of third-party data processors used by Promptfoo
last_updated: 2024-11-13
version: 1.0
---

# Subprocessors

This page lists the third-party subprocessors that Promptfoo uses to provide our services. As a privacy-first company that operates primarily as local-first software, we minimize our use of third-party services and maintain strict data processing standards.

## What is a Subprocessor?

A subprocessor is a third-party service provider that processes data on behalf of Promptfoo. We carefully select vendors and only work with those who maintain high security and privacy standards.

## Our Commitment to Privacy

As noted in our [Privacy Policy](/privacy), Promptfoo is designed to be privacy-first:

- **Local Operation:** Our open-source tool runs completely locally on your machine.
- **User Control:** Data is not transmitted unless you explicitly configure it to do so.
- **API Keys Security:** API keys remain local and are never transmitted to our servers.
- **Compliance:** We adhere to all applicable data protection laws, including GDPR and CCPA.

## Current Subprocessors

### Infrastructure & Hosting

These subprocessors support the infrastructure and hosting services necessary for Promptfoo's operations.

| Subprocessor   | Purpose                                     | Location      | Data Processing Activity                               | Security Certifications  | Data Retention | Privacy Policy                                                                                            |
| -------------- | ------------------------------------------- | ------------- | ------------------------------------------------------ | ------------------------ | -------------- | --------------------------------------------------------------------------------------------------------- |
| **GitHub**     | Documentation hosting, package distribution | United States | Hosts documentation and npm packages                   | SOC 1/2/3, ISO 27001     | N/A            | [GitHub Privacy Policy](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement) |
| **Cloudflare** | CDN, DDoS protection, KV storage            | United States | Serves static assets and protects against DDoS attacks | SOC 2 Type II, ISO 27001 | 14 days        | [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/)                                    |

### LLM API Providers

The following subprocessors are only used when you explicitly configure them and provide your own API keys. No data is processed through these providers unless you specifically invoke them:

| Subprocessor             | Purpose                   | Location                   | Data Categories                                       | Security Standards | Privacy Policy                                                               |
| ------------------------ | ------------------------- | -------------------------- | ----------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| OpenAI                   | LLM API Provider          | United States              | - Prompt inputs<br>- Model outputs<br>- Usage metrics | SOC 2 Type II      | [OpenAI Privacy Policy](https://openai.com/privacy)                          |
| Anthropic                | LLM API Provider          | United States              | - Prompt inputs<br>- Model outputs<br>- Usage metrics | SOC 2 Type II      | [Anthropic Privacy Policy](https://www.anthropic.com/privacy)                |
| Google Cloud (Vertex AI) | LLM API Provider          | Global (US, EU, APAC)      | - Prompt inputs<br>- Model outputs<br>- Usage metrics | ISO 27001, SOC 2/3 | [Google Cloud Privacy Policy](https://policies.google.com/privacy)           |
| Azure OpenAI             | LLM API Provider          | User-selected Azure region | - Prompt inputs<br>- Model outputs<br>- Usage metrics | ISO 27001, SOC 2   | [Azure Privacy Policy](https://privacy.microsoft.com/en-us/privacystatement) |
| Hugging Face             | Model Hub & Inference API | United States, France      | - Prompt inputs<br>- Model outputs<br>- Usage metrics | SOC 2 Type II      | [Hugging Face Privacy Policy](https://huggingface.co/privacy)                |
| Replicate                | Model Deployment Platform | United States              | - Prompt inputs<br>- Model outputs<br>- Usage metrics | SOC 2              | [Replicate Privacy Policy](https://replicate.com/privacy)                    |

### Optional Integrations

These subprocessors are only used if you explicitly enable their related features:

| Subprocessor     | Purpose                 | Location      | Used When                       | Data Retention             | Privacy Policy                                                         |
| ---------------- | ----------------------- | ------------- | ------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Google Workspace | Spreadsheet integration | United States | Using Google Sheets integration | Duration of test execution | [Google Workspace Privacy Policy](https://policies.google.com/privacy) |
| Discord          | Community support       | United States | Accessing Discord community     | Per Discord policy         | [Discord Privacy Policy](https://discord.com/privacy)                  |
| Langfuse         | Prompt management       | Germany       | Using `langfuse://` prompts     | Per user configuration     | [Langfuse Privacy Policy](https://langfuse.com/privacy)                |

### Enterprise Features

The following subprocessors are only relevant for Promptfoo Enterprise customers:

| Subprocessor | Purpose            | Location      | Used When                   | Data Protection | Privacy Policy                                    |
| ------------ | ------------------ | ------------- | --------------------------- | --------------- | ------------------------------------------------- |
| Cal.com      | Meeting scheduling | United States | Scheduling enterprise demos | GDPR compliant  | [Cal.com Privacy Policy](https://cal.com/privacy) |

## Data Protection Measures

We implement robust data protection measures to safeguard your information:

- **Encryption:** All data transmitted to subprocessors is encrypted in transit using TLS/SSL protocols.
- **Access Control:** We employ strict access controls to limit who can access data processed by subprocessors.
- **Compliance:** All subprocessors are vetted for compliance with relevant data protection regulations, including GDPR and CCPA.

## User Control and Consent

- **Opt-Out of Analytics:** You can disable anonymous usage analytics by setting the `PROMPTFOO_DISABLE_ANALYTICS` environment variable to `1`.
- **Configure Subprocessors:** Services that require explicit configuration (like LLM API providers) will only process data when you provide your API keys.

## Updates and Notifications

We maintain version control of this subprocessors list and will notify customers of material changes through:

- Email notifications for enterprise customers
- Discord announcements
- GitHub releases
- Documentation updates

Changes will take effect 30 days after notification unless immediate security updates are required.

## Questions

If you have questions about our subprocessors or data processing practices, please contact us:

- Email: [inquiries@promptfoo.dev](mailto:inquiries@promptfoo.dev)
- GitHub: [Open an issue](https://github.com/promptfoo/promptfoo/issues)
- Discord: [Join our community](https://discord.gg/gHPS9jjfbs)

## Additional Information

For more details about our privacy practices and commitment to data security, please refer to:

- [Privacy Policy](/privacy)
- [Enterprise Security Features](/docs/red-team)
- [Self-hosting Guide](/docs/usage/self-hosting)
