# http-provider-auth-signature-pfx (HTTP provider with PFX certificate signature authentication)

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-auth-signature-pfx
```

## Introduction

This example demonstrates how to setup authentication with an HTTP provider using certificates for cryptographic signature validation. You can use either:

1. A PFX certificate file (PKCS#12 format)
2. Separate CRT and KEY files

## Prerequisites

- Node.js 18.0.0 or higher
- Either a PFX certificate file OR separate CRT and KEY files with a keypair for signing/verification

## Setup

### Installation

1. Install dependencies:

```bash
npm install
```

2. **Create certificates** (if you don't have them):

#### Option A: PFX Certificate

```bash
# First, create a private key and certificate
openssl req -x509 -newkey rsa:2048 -keyout private.key -out certificate.crt \
  -days 365 -nodes -subj "/CN=PromptFoo Test/O=Test/C=US"

# Then, create a PFX file from the key and certificate
openssl pkcs12 -export -out certificate.pfx -inkey private.key -in certificate.crt \
  -passout pass:password

# Clean up temporary files
rm private.key certificate.crt
```

#### Option B: Separate CRT and KEY Files

```bash
# Create a private key and certificate (keep both files)
openssl req -x509 -newkey rsa:2048 -keyout private.key -out certificate.crt \
  -days 365 -nodes -subj "/CN=PromptFoo Test/O=Test/C=US"

# No cleanup needed - both files are used directly
```

3. Start the server:

```bash
npm start
```

## Configuration

The example includes two configuration files demonstrating different certificate formats:

### Option A: PFX Certificate (`promptfooconfig.yaml`)

```yaml
signatureAuth:
  type: pfx
  pfxPath: ./certificate.pfx
  pfxPassword: password
  signatureAlgorithm: SHA256
  signatureValidityMs: 300000
  signatureDataTemplate: 'promptfoo-app{{signatureTimestamp}}'
```

### Option B: Separate CRT/KEY Files (`promptfooconfig-crt-key.yaml`)

```yaml
signatureAuth:
  type: pfx
  certPath: ./certificate.crt
  keyPath: ./private.key
  signatureAlgorithm: SHA256
  signatureValidityMs: 300000
  signatureDataTemplate: 'promptfoo-app{{signatureTimestamp}}'
```

**Important**: In production, use environment variables for passwords and secure key management practices.

## Running Tests

Note, for this example to work, you will need to set the environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0`, as this cert is self-signed.

```bash
# Run test cases with PFX certificate
NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval --no-cache

# Or run with separate CRT/KEY files
NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-crt-key.yaml --no-cache

# View results
promptfoo view
```

**IMPORTANT**: Be sure to run with `--no-cache` when testing! Otherwise it may cache responses from good signatures.

## How it Works

1. The server loads the certificate (either from PFX file or separate CRT/KEY files) and extracts the public key for signature verification
2. The promptfoo HTTP provider uses the same certificate to generate signatures
3. Incoming requests must include signature headers (`signature`, `timestamp`, `client-id`)
4. The server validates the timestamp and verifies the signature using the public key
5. Only requests with valid signatures are processed

## Environment Variables

This example uses hardcoded values for simplicity. In production, you should use:

- `PROMPTFOO_PFX_PASSWORD` - Password for the PFX certificate file (when using PFX option)

## About Certificate Formats

### PFX/PKCS#12

PFX (Personal Information Exchange) is a binary format for storing cryptographic objects. It's commonly used on Windows systems and can contain:

- Private keys
- Public key certificates
- Certificate chains
- Other cryptographic data

This format is password-protected and provides a convenient way to transport certificates and private keys together.

### Separate CRT/KEY Files

Alternatively, you can use separate certificate and key files:

- **CRT file**: Contains the public certificate in PEM format
- **KEY file**: Contains the private key in PEM format

This approach is common in Unix/Linux environments and provides flexibility in managing certificates and keys separately.

Both formats are supported by the promptfoo HTTP provider for cryptographic signature generation and verification.
