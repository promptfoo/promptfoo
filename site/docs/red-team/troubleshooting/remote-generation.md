---
sidebar_label: Remote Generation Errors
description: Red team remote API connectivity issues by diagnosing network blocks and security policies to ensure secure access for LLM adversarial testing workflows
---

# Remote Generation Errors

You may encounter connection issues due to corporate firewalls or security policies. Since our service generates potentially harmful outputs for testing purposes, some organizations' security policies may block access to our API endpoints.

## Checking Connectivity

To verify if you can reach our API, try accessing Promptfoo's version endpoint:

```bash
curl https://api.promptfoo.app/version
```

You should receive a response like:

```json
{
  "version": "0.103.3"
}
```

If this request fails or times out, it likely means your network is blocking access to our API. You can also try opening `https://api.promptfoo.app/version` in your browser to see if you can reach the page.

## Common Solutions

1. **Check with IT**: Since promptfoo generates adversarial content for security testing, our API endpoints may be blocked by corporate security policies. Contact your IT department to:
   - Allowlist `api.promptfoo.app`
   - Allow HTTPS traffic to our endpoints
   - Review security logs for blocked requests

2. **Use a Different Network**: Try running promptfoo on:
   - A personal network
   - Mobile hotspot
   - Development environment outside corporate network

3. **Configure Proxy**: If you need to use a corporate proxy, configure it using environment variables. Promptfoo uses Node.js's [Undici](https://undici.nodejs.org/#/docs/api/ProxyAgent.md) to handle proxy configuration with standard proxy environment variables.

   **Important**: The proxy URL must include the protocol prefix:

   ```bash
   # ✅ Correct - includes http:// prefix
   export HTTPS_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://127.0.0.1:8080  # For tools like Burp Suite

   # ❌ Wrong - missing protocol prefix (common error)
   export HTTPS_PROXY=127.0.0.1:8080

   # With authentication
   export HTTPS_PROXY=http://username:password@proxy.company.com:8080

   promptfoo redteam run
   ```

   **For debugging proxy issues with tools like Burp Suite**, you may also need:
   ```bash
   # Custom CA certificate for HTTPS interception
   export PROMPTFOO_CA_CERT_PATH=/path/to/burpsuite-ca.crt
   ```

## Alternative Options

If you cannot get network access to our remote generation service, you can:

1. Use local generation with a local LLM
2. Set up your own generation service
3. Use manual prompt creation

See our [configuration guide](/docs/configuration/guide/) for more details on these options.

## Getting Help

If you continue experiencing issues, [contact us](/contact/) for enterprise support.
