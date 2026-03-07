# HTTP Provider with TLS Certificates

This example demonstrates how to configure the HTTP provider with TLS/SSL certificates for mutual TLS (mTLS) authentication.

## Overview

The HTTP provider supports multiple certificate formats for mutual TLS authentication:

1. **PEM (Separate cert/key files)**: Traditional format with separate certificate and key files
2. **PEM with Encrypted Key**: PEM format where the private key is password-protected
3. **PFX/PKCS#12**: Combined certificate bundle format

Each format can be provided via:

- **File Path**: Reference files on disk
- **Inline Content**: Embed certificate content directly (base64 for binary formats)
- **Environment Variables**: Load from environment variables

## PEM Certificate Options

### Using Unencrypted PEM Files

The simplest approach - separate certificate and key files:

```yaml
tls:
  certPath: '/path/to/client-cert.pem'
  keyPath: '/path/to/client-key.pem'
```

### Using Encrypted PEM Private Key

When your private key is password-protected (starts with `BEGIN ENCRYPTED PRIVATE KEY`):

```yaml
tls:
  certPath: '/path/to/client-cert.pem'
  keyPath: '/path/to/client-key-encrypted.pem'
  passphrase: 'your-key-password'
```

### Using Inline PEM Content

Embed certificates directly in your configuration:

```yaml
tls:
  cert: |
    -----BEGIN CERTIFICATE-----
    MIIDxTCCAq2gAwIBAgIJAL...
    -----END CERTIFICATE-----
  key: |
    -----BEGIN PRIVATE KEY-----
    MIIEvQIBADANBgkqhkiG9w0B...
    -----END PRIVATE KEY-----
```

## PFX Certificate Options

### Using File Path

Reference a PFX file on the filesystem:

```yaml
tls:
  pfxPath: '/path/to/certificate.pfx'
  passphrase: 'your-passphrase'
```

### Using Inline Base64 Content

Embed the certificate directly in your configuration:

```yaml
tls:
  pfx: 'MIIJKQIBAzCCCO8GCSqGSIb3DQEHA...' # Base64-encoded PFX
  passphrase: 'your-passphrase'
```

### Using Environment Variables

Store sensitive certificates in environment variables:

```yaml
tls:
  pfx: '{{env.PFX_CERTIFICATE_BASE64}}'
  passphrase: '{{env.PFX_PASSPHRASE}}'
```

## Converting PFX to Base64

To use inline PFX certificates, you need to convert your PFX file to base64:

### Linux/Mac

```bash
base64 -i certificate.pfx -o certificate.b64
```

### Windows

```cmd
certutil -encode certificate.pfx certificate.b64
```

Then copy the content (excluding the BEGIN/END headers) to use as the `pfx` value.

## Security Considerations

1. **Never commit certificates to version control**: Use environment variables or external secret management
2. **Protect your private keys**: Ensure PFX files have appropriate file permissions
3. **Use strong passphrases**: Always protect PFX files with strong passphrases
4. **Certificate validation**: Keep `rejectUnauthorized: true` in production

## Running the Example

1. Replace the sample certificate values with your actual certificates
2. Set the required environment variables:
   ```bash
   export PFX_PASSPHRASE="your-passphrase"
   export PFX_CERTIFICATE_BASE64="your-base64-cert"
   ```
3. Run the evaluation:
   ```bash
   promptfoo eval
   ```

## TLS Configuration Options

| Option               | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `cert`               | Inline PEM certificate content                            |
| `certPath`           | Path to PEM certificate file                              |
| `key`                | Inline PEM private key content                            |
| `keyPath`            | Path to PEM private key file                              |
| `pfx`                | Inline PFX certificate (base64-encoded string or Buffer)  |
| `pfxPath`            | Path to PFX file on disk                                  |
| `passphrase`         | Password for encrypted PEM private key or PFX certificate |
| `ca`                 | CA certificate content for server verification            |
| `caPath`             | Path to CA certificate file                               |
| `rejectUnauthorized` | Verify server certificates (always `true` in production)  |
| `minVersion`         | Minimum TLS version (e.g., 'TLSv1.2')                     |
| `maxVersion`         | Maximum TLS version (e.g., 'TLSv1.3')                     |
| `ciphers`            | Cipher suite specification                                |

## Troubleshooting

### Invalid PFX Format

If you get an error about invalid PFX format:

- Ensure the base64 encoding is correct
- Verify the passphrase is correct
- Check that the PFX file is not corrupted

### Connection Refused

If the connection is refused:

- Verify the server requires client certificates
- Ensure the certificate is valid and not expired
- Check that the certificate is trusted by the server

### Certificate Verification Failed

If certificate verification fails:

- Add the server's CA certificate using `ca` or `caPath`
- For development only: set `rejectUnauthorized: false` (never in production)

## Related Documentation

- [HTTP Provider Documentation](https://promptfoo.com/docs/providers/http)
- [TLS/HTTPS Configuration](https://promptfoo.com/docs/providers/http#tlshttps-configuration)
