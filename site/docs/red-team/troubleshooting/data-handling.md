---
sidebar_label: Data Handling and Privacy
description: Understand what data is sent to promptfoo servers during red teaming operations and how to configure data privacy settings for secure LLM testing
---

# Data Handling and Privacy

When using promptfoo for red team testing, it's important to understand what data is transmitted to external services and how to control this behavior for compliance and security purposes.

## What Data Is Sent to Promptfoo Servers

### Community Version

1. **Red Team Test Generation**: Application details and purpose description for creating contextual attacks
2. **Test Result Grading**: Prompts and responses for vulnerability assessment (unless you use your own OpenAI API key)
3. **Basic Telemetry**: Anonymous usage analytics (see [telemetry docs](/docs/configuration/telemetry/))

### What Is NOT Sent

- Model weights or training data
- Configuration files or secrets  
- Production data beyond specific test cases
- Any data when telemetry is disabled

## How to Minimize External Data Transmission

### 1. Use Your Own OpenAI API Key

Set `OPENAI_API_KEY` in your environment - promptfoo automatically detects it and uses your key for grading instead of our servers.

### 2. Disable Telemetry

```bash
export PROMPTFOO_DISABLE_TELEMETRY=1
```

### 3. Force Local Generation

For complete control over data:

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

Note: Local generation quality depends on your configured model and is generally lower than our remote service. See the [red team configuration guide](/docs/red-team/configuration/) for details.

## Enterprise Solutions for Complete Data Control

For organizations requiring complete data isolation, see [Enterprise On-Prem](/docs/enterprise/) which provides:
- Fully airgapped deployments
- Dedicated runner within your infrastructure
- Complete control over all data flow

## Network Connectivity Requirements

Community version requires access to:
- `api.promptfoo.app` - Test generation and grading
- `a.promptfoo.app` - Additional API services

### Corporate Firewall Issues

If blocked by corporate firewall:
1. Request IT allowlist promptfoo domains
2. Test with: `curl https://api.promptfoo.app/version`
3. See [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/)

## Data Privacy Validation

Community testing confirms that with telemetry disabled and your own API keys, promptfoo transmits only necessary test operation data. 

Validate yourself by:
- Monitoring network traffic (e.g., Burp Suite)
- Reviewing promptfoo logs for external calls
- Testing with dummy data first

## Compliance Considerations

**Regulated Industries**: Use [Enterprise On-Prem](/docs/enterprise/) for:
- Banking/Financial (sensitive financial data)
- Healthcare (HIPAA compliance) 
- Government (air-gapped requirements)

## Related Documentation

- [Telemetry Configuration](/docs/configuration/telemetry/)
- [Red Team Configuration](/docs/red-team/configuration/) 
- [Remote Generation Troubleshooting](/docs/red-team/troubleshooting/remote-generation/)
- [Enterprise Solutions](/docs/enterprise/)
- [Privacy Policy](/privacy/)