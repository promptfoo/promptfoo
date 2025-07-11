# http-provider-auth-signature-jks (HTTP provider with JKS certificate signature authentication)

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-auth-signature-jks
```

## Introduction

This example demonstrates how to setup authentication with an HTTP provider using JKS (Java KeyStore) certificates for cryptographic signature validation.

## Prerequisites

- Node.js 18.0.0 or higher
- A JKS keystore file with a keypair for signing/verification

## Setup

### Installation

1. Install dependencies:

```bash
npm install
```

2. **Create a JKS keystore** (if you don't have one):

```bash
# Generate a self-signed certificate and store it in a JKS keystore
keytool -genkeypair -alias client -keyalg RSA -keysize 2048 \
  -keystore clientkeystore.jks -storepass password -keypass password \
  -dname "CN=PromptFoo Test, OU=Test, O=Test, L=Test, ST=Test, C=US" \
  -validity 365
```

3. Start the server:

```bash
npm start
```

## Configuration

The example uses the following JKS configuration:

- **Keystore Path**: `./clientkeystore.jks`
- **Keystore Password**: `password`
- **Key Alias**: `client`
- **Key Password**: `password`
- **Signature Algorithm**: SHA256

**Important**: In production, use environment variables for passwords and secure key management practices.

### Checking Your Keystore

If you're unsure about the alias or contents of your JKS keystore, you can inspect it using:

```bash
keytool -list -keystore clientkeystore.jks -storepass password
```

This will show all aliases in the keystore. Update the `keyAlias` in both `app.js` and `promptfooconfig.yaml` to match your actual alias.

## Running Tests

```bash
# Set the keystore password via environment variable
export PROMPTFOO_JKS_PASSWORD=password

# Run test cases
promptfoo eval --no-cache

# View results
promptfoo view
```

Alternatively, you can uncomment the `keystorePassword` line in `promptfooconfig.yaml` and run directly:

```bash
# Run test cases (with password in config)
promptfoo eval --no-cache
```

**IMPORTANT**: Be sure to run with `--no-cache` when testing! Otherwise it may cache responses from good signatures.

## How it Works

1. The server loads the JKS keystore and extracts the public key certificate
2. Incoming requests must include signature headers (`signature`, `timestamp`, `client-id`)
3. The server validates the timestamp and verifies the signature using the public key
4. Only requests with valid signatures are processed

## Environment Variables

This example demonstrates using environment variables for sensitive data:

- `PROMPTFOO_JKS_PASSWORD` - Password for the JKS keystore (alternative to config keystorePassword)
- `KEYSTORE_PASSWORD` - Password for the JKS keystore (used by server)
- `KEY_PASSWORD` - Password for the private key (used by server)

### Using Environment Variables

You can provide the keystore password in two ways:

1. **Via environment variable (recommended for production):**

   ```bash
   export PROMPTFOO_JKS_PASSWORD=password
   promptfoo eval
   ```

2. **Via configuration file:**
   ```yaml
   signatureAuth:
     type: jks
     keystorePath: ./clientkeystore.jks
     keystorePassword: password # Direct config
   ```

If both are provided, the configuration file value takes precedence, with the environment variable serving as a fallback.
