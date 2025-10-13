---
description: Privacy policy for promptfoo services - we don't collect PII, API keys stay local, and telemetry is anonymous and opt-out
---

# Privacy Policy

This Privacy Policy describes how your personal information is collected, used, and shared when you use Promptfoo Command Line Interface (CLI), library, and website.

## Local Execution and Data Privacy

The Promptfoo CLI and library execute locally on your machine. Your source code, API keys, prompts, and LLM outputs remain on your local machine. Any calls to Language Model (LLM) APIs (OpenAI, Anthropic, etc.) are sent directly to the LLM provider from your machine. We do not have access to these requests or responses.

API keys are set as local environment variables and never transmitted to anywhere besides the LLM API directly (OpenAI, Anthropic, etc).

**Data We Do Not Collect:**
- Your prompts or test cases
- LLM inputs and outputs
- API keys or credentials
- Source code

Additionally, we do not sell or trade data to outside parties.

## Sharing and Storage of Information

If you explicitly run the share command, your inputs/outputs are stored in Cloudflare KV for 2 weeks. This only happens when you run `promptfoo share` or click the "Share" button in the web UI. This shared information creates a URL which can be used to view the results. The URL is valid for 2 weeks and is publicly accessible, meaning anyone who knows the URL can view your results. After 2 weeks, all data associated with the URL is permanently deleted. To completely disable sharing, set: `PROMPTFOO_DISABLE_SHARING=1`.

## Telemetry

Promptfoo collects basic telemetry by default to help us improve the product. For detailed information about what data is collected and how to disable it, see our [Telemetry Documentation](/docs/configuration/telemetry).

## Remote Generation

SimulatedUser and red team features use Promptfoo's hosted inference endpoints by default. Your target model always runs locally.

To disable remote generation, set `PROMPTFOO_DISABLE_REMOTE_GENERATION=true`.

The CLI checks NPM's package registry for updates. If there is a newer version available, it will notify the user. To disable, set: `PROMPTFOO_DISABLE_UPDATE=1`.

## GDPR and Data Processing Agreement

Promptfoo is designed to be compliant with the General Data Protection Regulation (GDPR). As we do not collect or process any personally identifiable information (PII), and all operations are conducted locally on your machine with data not transmitted or stored elsewhere, the typical need for a Data Processing Agreement (DPA) under GDPR is not applicable in this instance.

However, we are committed to ensuring the privacy and protection of all users and their data. If you have any questions or concerns regarding GDPR compliance, please get in touch via GitHub or Discord.

---

## Cloud Application (promptfoo.app)

This section applies specifically to users of the Promptfoo Cloud platform hosted at promptfoo.app. The cloud application is a separate service from the CLI and library, and involves additional data collection and processing.

### Data We Collect

The cloud application collects and processes the following information:

- **Account Information**: Name, email address, organization name
- **Authentication Data**: Session information, login timestamps
- **Evaluation Data**: Test configurations, prompts, model outputs, evaluation results
- **Usage Data**: Feature usage, API calls, team and organization membership
- **API Tokens**: Encrypted API tokens for LLM providers (stored securely, never logged)

### Cookies and Local Storage

The cloud application uses the following for functionality:

- **Essential Cookie**: `promptfoo.sid` - A session cookie required for authentication. This cookie is essential for the service to function and does not require consent under GDPR.
- **Local Storage**: We use browser localStorage (not cookies) for:
  - Analytics preferences (PostHog, opt-out capable)
  - Identity provider settings
  - UI preferences

**We do not use any marketing, advertising, or non-essential tracking cookies.**

### Third-Party Services

The cloud application uses the following third-party services:

- **PostHog** (Analytics) - Uses localStorage for anonymous analytics. Can be disabled via account settings.
- **Sentry** (Error Tracking) - Monitors application errors to improve service reliability. Does not collect PII.
- **Pylon** (Customer Support) - Provides in-app support chat functionality.
- **FusionAuth** (Authentication) - Manages user authentication and SSO.

All third-party services are carefully selected to ensure GDPR compliance.

### Legal Basis for Processing

We process your data under the following legal bases:

- **Contractual Necessity**: To provide the cloud service you've signed up for
- **Legitimate Interest**: To improve our service, provide support, and ensure security
- **Consent**: For optional analytics and support features (which can be disabled)

### Data Retention

- **Account Data**: Retained while your account is active and for 30 days after account deletion
- **Evaluation Results**: Retained according to your subscription plan (contact us for specific retention periods)
- **Session Cookies**: Expire after 30 days of inactivity
- **Analytics Data**: Aggregated and anonymized data may be retained indefinitely

### Your Rights Under GDPR

You have the following rights regarding your personal data:

- **Right to Access**: Request a copy of your personal data
- **Right to Rectification**: Correct inaccurate personal data
- **Right to Erasure**: Request deletion of your personal data ("right to be forgotten")
- **Right to Data Portability**: Receive your data in a machine-readable format
- **Right to Object**: Object to processing of your personal data
- **Right to Restrict Processing**: Request restriction of processing under certain conditions
- **Right to Withdraw Consent**: Opt out of optional data collection at any time

To exercise any of these rights, please contact us at privacy@promptfoo.dev or through the support chat in the application.

### Data Security

We implement appropriate technical and organizational measures to protect your personal data, including:

- Encryption in transit (TLS/HTTPS)
- Encryption at rest for sensitive data
- Regular security audits
- Access controls and authentication
- Secure data centers and infrastructure

### International Data Transfers

Data may be processed and stored in the United States and other countries where our service providers operate. We ensure appropriate safeguards are in place for international transfers in compliance with GDPR.

### Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any material changes via email or through the application.

### Contact Information

For privacy-related questions or to exercise your GDPR rights:

- **Email**: privacy@promptfoo.dev
- **Support Chat**: Available in the application
- **GitHub**: Open an issue for privacy-related questions

**Last Updated**: January 2025
