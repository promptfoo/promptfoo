# http-provider-auth-signature-pfx (HTTP provider with PFX certificate signature authentication)

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-auth-signature-pfx
```

## Introduction

This example demonstrates how to setup authentication with an HTTP provider using PFX (PKCS#12) certificates for cryptographic signature validation.

## Prerequisites

- Node.js 18.0.0 or higher
- A PFX certificate file with a keypair for signing/verification

## Setup

### Installation

1. Install dependencies:

```bash
npm install
```

2. **Create a PFX certificate** (if you don't have one):

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

3. Start the server:

```bash
npm start
```

## Configuration

The example uses the following PFX configuration:

- **PFX Path**: `./certificate.pfx`
- **PFX Password**: `password`
- **Signature Algorithm**: SHA256

**Important**: In production, use environment variables for passwords and secure key management practices.

## Running Tests

```bash
# Run test cases
promptfoo eval --no-cache

# View results
promptfoo view
```

**IMPORTANT**: Be sure to run with `--no-cache` when testing! Otherwise it may cache responses from good signatures.

## How it Works

1. The server loads the PFX certificate and extracts the public key
2. Incoming requests must include signature headers (`signature`, `timestamp`, `client-id`)
3. The server validates the timestamp and verifies the signature using the public key
4. Only requests with valid signatures are processed

## Environment Variables

This example uses hardcoded passwords for simplicity. In production, you should use:

- `PFX_PASSWORD` - Password for the PFX certificate file

## About PFX/PKCS#12

PFX (Personal Information Exchange) is a binary format for storing cryptographic objects. It's commonly used on Windows systems and can contain:

- Private keys
- Public key certificates
- Certificate chains
- Other cryptographic data

This format is password-protected and provides a convenient way to transport certificates and private keys together.
