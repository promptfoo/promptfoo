# custom-ca-certificates

This example demonstrates how to use custom certificates in various formats (CA, PFX, JKS) with promptfoo for secure connections to LLM APIs.

You can run this example with:

```bash
npx promptfoo@latest init --example custom-ca-certificates
```

## Supported Certificate Formats

### CA Certificates (Existing)

For custom Certificate Authority certificates:

```bash
export PROMPTFOO_CA_CERT_PATH=/path/to/ca-bundle.crt
```

### PFX Certificates (New)

For PKCS#12 / PFX certificate files:

```bash
export PROMPTFOO_PFX_CERT_PATH=/path/to/certificate.pfx
export PROMPTFOO_PFX_PASSWORD=your_pfx_password  # Optional
```

### JKS Certificates (New)

For Java KeyStore files:

```bash
export PROMPTFOO_JKS_CERT_PATH=/path/to/keystore.jks
export PROMPTFOO_JKS_PASSWORD=your_keystore_password  # Required
export PROMPTFOO_JKS_ALIAS=certificate_alias  # Optional, uses first available if not specified
```

## Usage Examples

### Example 1: Corporate CA Certificate

```bash
# Set the CA certificate path
export PROMPTFOO_CA_CERT_PATH=./certificates/corporate-ca.crt

# Run evaluation
npx promptfoo eval
```

### Example 2: Client Certificate with PFX

```bash
# Set PFX certificate and password
export PROMPTFOO_PFX_CERT_PATH=./certificates/client-cert.pfx
export PROMPTFOO_PFX_PASSWORD=mypassword

# Run evaluation
npx promptfoo eval
```

### Example 3: Java KeyStore

```bash
# Install the required dependency
npm install jks-js

# Set JKS certificate details
export PROMPTFOO_JKS_CERT_PATH=./certificates/keystore.jks
export PROMPTFOO_JKS_PASSWORD=keystorepassword
export PROMPTFOO_JKS_ALIAS=mycert

# Run evaluation
npx promptfoo eval
```

## Certificate Priority

When multiple certificate types are specified, they are applied in combination:

1. CA certificates are used for certificate authority validation
2. PFX certificates provide client certificate authentication
3. JKS certificates provide client certificate authentication

## Error Handling

- **Missing files**: promptfoo will log a warning and continue without the certificate
- **Invalid passwords**: The operation will fail with an appropriate error message
- **Missing JKS dependency**: For JKS support, install `jks-js` package
- **Invalid JKS alias**: Error message will list available aliases

## Security Notes

- Certificate passwords are read from environment variables only
- Certificates are loaded on-demand during network requests
- File paths can be absolute or relative to the working directory
- All certificate data remains local to your machine

## Troubleshooting

### JKS Certificate Issues

If you get an error about missing `jks-js` package:

```bash
npm install jks-js
```

### Certificate Path Issues

- Use absolute paths to avoid confusion
- Check file permissions
- Verify certificate file format

### Password Issues

- Ensure password environment variables are set correctly
- Check for special characters that might need escaping
- Verify the password is correct for the certificate file

## Technical Implementation

The certificate handling functionality is implemented in the `src/util/tlsUtils.ts` module, which provides:

- **`loadCertificates()`**: Loads certificates from environment variables in various formats
- **`applyCertificatesToTlsOptions()`**: Applies certificate data to Node.js TLS connection options
- **Dynamic imports**: JKS support uses dynamic imports to avoid requiring optional dependencies

The certificate loading is integrated into promptfoo's network layer (`src/fetch.ts`) and automatically applies to all HTTP requests made by promptfoo, including API calls to LLM providers.
