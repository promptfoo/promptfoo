# HTTP Provider with TLS PFX Certificates

This example demonstrates how to configure the HTTP provider with TLS/SSL certificates, specifically focusing on PFX (PKCS#12) certificate bundles.

## Overview

The HTTP provider supports multiple ways to provide PFX certificates for mutual TLS authentication:

1. **File Path**: Reference a PFX file on disk
2. **Inline Base64**: Embed the certificate as a base64-encoded string
3. **Environment Variables**: Load certificates from environment variables

## PFX Certificate Options

### Using File Path

The traditional approach - reference a PFX file on the filesystem:

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

| Option               | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `pfx`                | Inline PFX certificate (base64-encoded string or Buffer) |
| `pfxPath`            | Path to PFX file on disk                                 |
| `passphrase`         | Password for the PFX certificate                         |
| `ca`                 | CA certificate for server verification                   |
| `rejectUnauthorized` | Verify server certificates (always `true` in production) |
| `minVersion`         | Minimum TLS version (e.g., 'TLSv1.2')                    |
| `maxVersion`         | Maximum TLS version (e.g., 'TLSv1.3')                    |
| `ciphers`            | Cipher suite specification                               |

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
