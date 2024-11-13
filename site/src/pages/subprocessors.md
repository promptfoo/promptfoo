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

## Service-Specific Subprocessors

### Promptfoo Eval (Local Usage)

Promptfoo Eval is our core open-source evaluation tool that runs completely locally. It has minimal data processing requirements:

- **LLM API Providers:** Only used when you explicitly configure them with your own API keys
- **Anonymous Telemetry:** Basic usage metrics collected unless opted out (set `PROMPTFOO_DISABLE_TELEMETRY=1`)

| Subprocessor                        | Purpose                 | Location       | Data Processing Activity                          | Security Standards | Data Retention |
| ----------------------------------- | ----------------------- | -------------- | ------------------------------------------------- | ------------------ | -------------- |
| Plausible Analytics                 | Anonymous usage metrics | European Union | Collects anonymized CLI/WebUI usage data          | GDPR Compliant     | 24 months      |
| [LLM Providers](#llm-api-providers) | Model inference         | Varies         | Processes prompts/completions using your API keys | Varies             | None           |

### Promptfoo Cloud & Shared Evaluations

When using Promptfoo Cloud or sharing evaluations, additional processing is required:

| Subprocessor          | Purpose                | Location      | Data Processing Activity         | Security Standards | Data Retention |
| --------------------- | ---------------------- | ------------- | -------------------------------- | ------------------ | -------------- |
| Google Cloud Platform | Backend infrastructure | United States | Hosts shared evaluation data     | ISO 27001, SOC 2/3 | 30 days        |
| Cloudflare            | CDN & DDoS protection  | United States | Caches shared evaluation results | SOC 2 Type II      | 14 days        |

**Note:** When sharing evaluations, we collect your email address for authentication and notification purposes.

### Promptfoo Red Team

Red Team features involve additional processing for security testing:

| Subprocessor          | Purpose              | Location      | Data Processing Activity               | Security Standards | Data Retention |
| --------------------- | -------------------- | ------------- | -------------------------------------- | ------------------ | -------------- |
| Google Cloud Platform | Hosting & Processing | United States | Hosts red team infrastructure          | ISO 27001, SOC 2/3 | None           |
| OpenAI                | Prompt analysis      | United States | Processes prompts for security testing | SOC 2 Type II      | None           |
| Custom Models         | Unaligned testing    | United States | Tests prompts against custom models    | Internal standards | None           |

**Important Security Notes:**

- Red Team prompt processing can use your local OpenAI API key or our proxy service
- When using our proxy, data is processed but not retained
- Custom unaligned models are hosted internally for security testing
- Additional consent is required for certain red team features

## Data Collection Details

### Anonymous Telemetry

Promptfoo collects anonymous usage data to improve the tool. This includes:

- Command usage statistics
- Feature adoption metrics
- Error reporting
- WebUI interaction data

You can disable telemetry by setting the environment variable:

```bash
PROMPTFOO_DISABLE_TELEMETRY=1
```

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
