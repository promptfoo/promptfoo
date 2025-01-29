---
sidebar_position: 1
---

# Using Postman as a Proxy

Use Postman as a proxy server for promptfoo to leverage your team's existing API configurations without writing custom providers or storing your secrets in promptfoo. Rather than copying credentials or writing custom code, just point promptfoo at your Postman proxy and use your existing setup.

## Setup Guide

First, make sure you have the [Postman desktop app installed](https://www.postman.com/downloads/) (proxy features aren't available in the web version), promptfoo (`npm install -g promptfoo`), and your LLM API keys ready.

### Setting Up Postman's Proxy

Open Postman and head to Settings (the gear icon in the top right). In the Proxy tab, you'll find three proxy options: default, system, and custom. For our purposes, we want the custom proxy:

1. Under "Proxy configurations for sending requests", enable "Use custom proxy configuration"
2. Set both HTTP and HTTPS as proxy types - we need both for LLM APIs
3. For the proxy server, enter `127.0.0.1` (localhost)
4. Set the port to `8080` (or another port if 8080 is in use)
5. If you need authentication, toggle "Proxy auth" and enter your credentials
6. Leave "Proxy bypass" empty unless you have specific hosts to exclude

### Installing the Certificate

For HTTPS traffic (which most LLM APIs use), Postman needs to install a certificate. In the same Proxy settings tab:

1. Click "Get Certificate" to download Postman's certificate
2. Install it in your system:

For macOS:

- Double-click the downloaded certificate
- Add it to your System keychain (not login)
- Open Keychain Access, find the certificate
- Double-click it and expand "Trust"
- Set "When using this certificate" to "Always Trust"

For Windows:

- Double-click the certificate
- Choose "Install Certificate"
- Select "Local Machine"
- Click "Place all certificates in the following store"
- Browse and select "Trusted Root Certification Authorities"
- Complete the wizard

For Linux:

- Copy the certificate to your CA store:
  ```bash
  sudo cp /path/to/certificate.crt /usr/local/share/ca-certificates/
  sudo update-ca-certificates
  ```

### Configuring promptfoo

Now we'll tell promptfoo to use Postman's proxy. You have two options:

**Option 1: Environment Variables** (Recommended for testing)
Add to your shell or `.env` file:

```bash
# Point to Postman's proxy
HTTPS_PROXY=http://127.0.0.1:8080
HTTP_PROXY=http://127.0.0.1:8080

# Temporarily disable SSL verification for testing
NODE_TLS_REJECT_UNAUTHORIZED=0
```

**Option 2: SSL Configuration** (More secure)

```bash
# Use Postman's certificate
export PROMPTFOO_CA_CERT_PATH=/path/to/postman/certificate.crt
```

### Using Team Collections

If your team shares Postman collections, you can use them directly. Import your collection and its environment into Postman - any environment variables (like API keys) will work automatically through the proxy:

```json
{
  "variables": {
    "OPENAI_API_KEY": "{{postman_env_openai_key}}"
  }
}
```

## Troubleshooting

If requests aren't showing up in Postman:

1. **Certificate Issues**
   First, verify the certificate is properly installed. Open Keychain Access (macOS) or Certificate Manager (Windows) and check that Postman's certificate is trusted. If you're still having issues, temporarily try `PROMPTFOO_INSECURE_SSL=true`.

2. **Connection Problems**
   Make sure Postman is running and the proxy is enabled. Try a basic curl command to test:

   ```bash
   curl -x http://127.0.0.1:8080 https://api.openai.com/v1/models
   ```

   If this fails, try a different port number.

3. **Environment Variables**
   Your system might have existing proxy settings interfering. Check for existing `HTTP_PROXY` or `HTTPS_PROXY` variables:
   ```bash
   env | grep -i proxy
   ```
   Clear them if needed:
   ```bash
   unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
   ```

## Security Notes ⚠️

Remember that Postman will see all your API traffic, including keys and credentials. Keep these points in mind:

1. Only use this setup in development
2. Never commit proxy-related environment variables
3. Clear Postman's history after debugging
4. Use environment variables instead of hardcoding keys
5. Remove the proxy configuration when not actively debugging

## Further Reading

- [Postman Proxy Documentation](https://learning.postman.com/docs/sending-requests/capturing-request-data/proxy/)
- [promptfoo FAQ](/docs/faq#proxy-configuration)
- [Troubleshooting Guide](/docs/usage/troubleshooting)
