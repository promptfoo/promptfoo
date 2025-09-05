---
sidebar_label: Data handling
description: Understand what data is sent to promptfoo servers during red teaming operations and how to configure data privacy settings for secure LLM testing
---

# Data handling and privacy

When using Promptfoo for testing, it's important to understand what data is transmitted to external services and how to control this behavior for compliance and security purposes.

## What data is sent to Promptfoo servers

### Community version

1. **Red team test generation**: Application details and purpose description for creating contextual attacks.
2. **Test result grading**: Prompts and responses for vulnerability assessment (unless you use your own OpenAI API key for grading).
3. **Basic telemetry**: Anonymous usage analytics (see [telemetry docs](/docs/configuration/telemetry/)).

### What is NOT sent

- Model weights or training data.
- Configuration files or secrets.
- Production data beyond specific test cases.
- Any data when telemetry is disabled.

## How to minimize external data transmission

### 1. Use your own OpenAI API key

Set `OPENAI_API_KEY` in your environment - promptfoo automatically detects it and uses your key for grading instead of our servers.

### 2. Disable telemetry

```bash
export PROMPTFOO_DISABLE_TELEMETRY=1
```

### 3. Force local generation

To default to local red team generation instead of remote, you can use:

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

### 4. Disable updates (for offline environments)

For completely offline environments, also disable update checks:

```bash
export PROMPTFOO_DISABLE_UPDATE=1
```

Note: Local generation quality depends on your configured model and is generally lower than our remote service. See the [red team configuration guide](/docs/red-team/configuration/) and [red team remote generation section](/docs/red-team/configuration/#remote-generation) for details.

## Enterprise solutions for complete data control

For organizations requiring complete data isolation, see [Enterprise On-Prem](/docs/enterprise/) which provides:
- Fully airgapped deployments with no external dependencies.
- Dedicated runner within your infrastructure.
- Complete control over all data flow.
- Enterprise-grade security and compliance features.
- Compliance support for regulated industries (banking, healthcare, government).

## Network connectivity requirements

Community version requires access to:
- `api.promptfoo.app` - Test generation and grading.
- `*.promptfoo.app` - Additional API services.

### Corporate firewall issues

If blocked by corporate firewall:
1. Request IT allowlist Promptfoo domains.
2. Test with: `curl https://api.promptfoo.app/version`.
3. See [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/).

## Data privacy validation

Community testing confirms that with telemetry disabled and your own API keys, promptfoo transmits only necessary test operation data. 

Validate yourself by:
- Monitoring network traffic (e.g., Burp Suite).
- Reviewing promptfoo logs for external calls.
- Testing with dummy data first.

## Related documentation

- [Telemetry Configuration](/docs/configuration/telemetry/)
- [Red Team Configuration](/docs/red-team/configuration/) 
- [Remote Generation Troubleshooting](/docs/red-team/troubleshooting/remote-generation/)
- [Enterprise Solutions](/docs/enterprise/)
- [Privacy Policy](/privacy/)