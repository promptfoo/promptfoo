---
sidebar_label: FAQ
---

# Frequently asked questions

### What is Promptfoo?

Promptfoo is a local-first, open-source tool designed to help evaluate (eval) large language models (LLMs). Promptfoo is designed for application developers and for business applications. It features a simple, flexible, and extensible API. With Promptfoo you can:

1. Systematically test prompts across multiple LLM providers.
2. Evaluate LLM outputs using various assertion types.
3. Calculate metrics like accuracy, safety, and performance.
4. Generate adversarial tests for LLM red teaming.
5. Run as a command-line tool, a library, integrate with testing frameworks, run in your ci/cd pipeline, and view results in the browser.

### What is LLM red teaming, and how does Promptfoo support it?

LLM red teaming is the process of systematically testing LLMs to identify potential vulnerabilities, weaknesses, and unintended behaviors before deployment. Promptfoo supports this by offering a framework for generating and executing adversarial tests, aligned with industry standards like OWASP LLM Top 10 and NIST AI Risk Management Framework.

Promptfoo's red teaming capabilities allow you to:

1. Generate adversarial tests specific to your LLM application.
2. Execute tests at scale in a pre-deployment environment.
3. Analyze results to improve AI system safety and reliability.
4. Continuously monitor LLM performance against evolving threats.

For more details, see our [LLM Red Teaming Guide](/docs/guides/llm-redteaming).

### Which LLM providers does Promptfoo support?

Promptfoo supports a wide range of LLM providers, including:

1. OpenAI (GPT-4o, GPT-3.5)
2. Anthropic (Claude)
3. Google (PaLM, Gemini)
4. Amazon Bedrock (Claude, Llama)
5. Azure OpenAI
6. Replicate
7. Hugging Face
8. Local models and custom API integrations

Promptfoo's flexible architecture allows for easy integration with new or custom LLM providers. For the most up-to-date list and integration instructions, please refer to our [Providers documentation](/docs/providers/).

### Does Promptfoo forward calls to an intermediate server?

No, the source code runs on your machine. Calls to LLM APIs are sent directly to the respective provider. The Promptfoo team does not have access to these requests or responses.

### Does Promptfoo store API keys?

No, API keys are stored as local environment variables and are never transmitted anywhere besides directly to the LLM API.

### Does Promptfoo store LLM inputs and outputs?

No, Promptfoo operates locally, and all data remains on your machine. The only exception is when you explicitly use the [share command](/docs/usage/sharing), which stores inputs and outputs in Cloudflare KV for two weeks.

### Do you collect any PII?

No, we do not collect any personally identifiable information (PII).

### How do I use a proxy with Promptfoo?

Promptfoo uses standard proxy environment variables for configuration. The following variables are supported in order of precedence:

1. `HTTPS_PROXY` / `https_proxy`: For HTTPS requests
2. `HTTP_PROXY` / `http_proxy`: For HTTP requests
3. `ALL_PROXY` / `all_proxy`: Fallback proxy for all protocols
4. `NO_PROXY` / `no_proxy`: Comma-separated list of hostnames, domain names, or IP addresses to bypass proxy

The proxy URL format is: `[protocol://][user:password@]host[:port]`

For example:

```bash
# Basic proxy configuration
export HTTPS_PROXY=http://proxy.company.com:8080
export HTTP_PROXY=http://proxy.company.com:8080

# Proxy with authentication
export HTTPS_PROXY=http://username:password@proxy.company.com:8080

# Bypass proxy for specific domains
export NO_PROXY=localhost,127.0.0.1,.internal.company.com
```

Notes:

- For HTTPS URLs, the HTTPS_PROXY setting takes precedence over HTTP_PROXY
- Environment variables are case-insensitive (https_proxy works the same as HTTPS_PROXY)
- NO_PROXY supports domain suffixes (e.g., `.internal.company.com` matches any subdomain)
- Environment variables are specific to your terminal/shell instance. For persistence, add them to your shell's startup file (e.g., `~/.bashrc`, `~/.zshrc`)

Common troubleshooting:

- Certificate errors: Check if your proxy requires a custom CA certificate (see SSL configuration below)
- Connection timeouts: Verify proxy URL format and credentials
- Internal sites not accessible: Configure NO_PROXY for internal domains
- Authentication issues: Ensure proxy credentials are properly URL-encoded

### How do I configure SSL certificates and security?

For environments with custom certificate authorities (like corporate environments), configure SSL/TLS settings using these environment variables:

1. `PROMPTFOO_CA_CERT_PATH`: Path to a custom CA certificate bundle in PEM format. The path can be absolute or relative to your working directory:

   ```bash
   # Absolute path
   export PROMPTFOO_CA_CERT_PATH=/path/to/ca-bundle.crt

   # Relative path
   export PROMPTFOO_CA_CERT_PATH=./certs/ca-bundle.crt
   ```

2. `PROMPTFOO_INSECURE_SSL`: Disables SSL certificate verification. Use only for testing, never in production:
   ```bash
   export PROMPTFOO_INSECURE_SSL=true
   ```

Important security notes:

- Custom CA certificates apply to both direct connections and proxy connections
- When using proxy authentication, protect environment variables in shared environments
- Certificate verification should remain enabled in production environments
- Invalid certificate paths will log a warning but won't prevent execution
- The certificate bundle must be in PEM format
- For proxy servers with self-signed certificates, you need to include their CA certificate in your bundle
- Multiple certificates can be concatenated in a single PEM file
- All sensitive information (proxy credentials, certificate paths) is automatically redacted in logs for security
- Enable verbose mode with `LOG_LEVEL=debug` to see detailed connection information (credentials and paths are automatically redacted)
- No sensitive configuration data (certificates, proxy credentials) is ever transmitted to promptfoo servers

Remember that like all environment variables, these settings are specific to your terminal/shell instance.

### How does Promptfoo integrate with existing development workflows?

Promptfoo can be integrated into CI/CD pipelines via [GitHub Action](https://github.com/promptfoo/promptfoo-action), used with testing frameworks like Jest and Vitest, and incorporated into various stages of the development process.

### Further Reading

- [General Troubleshooting Guide](/docs/usage/troubleshooting) - Memory optimization, API keys, timeouts, and debugging
- [Red Team Troubleshooting Guide](/docs/red-team/troubleshooting/overview) - Common issues with LLM red teaming
- [Configuration Guide](/docs/configuration/guide)
- [LLM Red Teaming Guide](/docs/guides/llm-redteaming)
