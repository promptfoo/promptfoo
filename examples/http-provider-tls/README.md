# http-provider-tls

This example demonstrates how to configure the HTTP provider with TLS certificates for secure HTTPS connections, including custom CA certificates, client certificates for mutual TLS (mTLS), and advanced security configurations.

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-tls
cd http-provider-tls
```

Then, you'll want to generate your example certs

```bash
./generate-test-certs.sh
```

Start the mock server to simulate a server that requires tls certs

```bash
node mock-server.js
```

and then run the eval:

```bash
npx promptfoo@latest eval
```

## Features Demonstrated

This example shows how to:

1. **Use custom CA certificates** for APIs with private certificate authorities
2. **Configure client certificates** for mutual TLS authentication
3. **Work with PFX/PKCS12 bundles** as an alternative to separate cert/key files
4. **Set advanced TLS options** like cipher suites and TLS versions
5. **Handle self-signed certificates** in development environments

## Configuration Examples

### Basic CA Certificate

For APIs using certificates signed by a private CA:

```yaml
providers:
  - id: http
    config:
      url: ${API_ENDPOINT}
      tls:
        caPath: ./certs/ca-cert.pem
        rejectUnauthorized: true
```

### Mutual TLS (mTLS)

For APIs requiring client certificate authentication:

```yaml
providers:
  - id: http
    config:
      url: ${API_ENDPOINT}
      tls:
        caPath: ./certs/ca-cert.pem
        certPath: ./certs/client-cert.pem
        keyPath: ./certs/client-key.pem
        rejectUnauthorized: true
```

### PFX/PKCS12 Bundle

For using a PFX certificate bundle:

```yaml
providers:
  - id: http
    config:
      url: ${API_ENDPOINT}
      tls:
        pfxPath: ./certs/client.pfx
        passphrase: ${PFX_PASSPHRASE}
```

### Development with Self-Signed Certificates

For local development (NOT for production):

```yaml
providers:
  - id: http
    config:
      url: https://localhost:8443/api
      tls:
        rejectUnauthorized: false # Only for development!
```

## Testing with a Mock HTTPS Server

This example includes a mock HTTPS server (`mock-server.js`) that you can use to test TLS configurations:

```bash
# Start the mock server
node mock-server.js

# In another terminal, run the evaluation
npm run local -- eval -c examples/http-provider-tls/promptfooconfig-mock.yaml
```

The mock server supports:

- Custom CA certificates
- Client certificate verification (mTLS)
- Configurable TLS options

## Security Best Practices

1. **Always verify certificates in production**: Set `rejectUnauthorized: true`
2. **Protect private keys**: Never commit private keys to version control
3. **Use environment variables**: Store sensitive data like passphrases in environment variables
4. **Rotate certificates regularly**: Update certificates before they expire
5. **Use strong TLS versions**: Prefer TLS 1.2 or higher

## Troubleshooting

### Certificate Verification Failed

```
Error: unable to verify the first certificate
```

**Solution**: Ensure you're providing the complete certificate chain in the CA file.

### Client Certificate Not Accepted

```
Error: Server rejected client certificate
```

**Solutions**:

- Verify the client certificate is signed by a CA the server trusts
- Check that both certificate and private key are provided
- Ensure the certificate hasn't expired

### PFX Password Issues

```
Error: mac verify failure
```

**Solution**: Verify the PFX passphrase is correct and properly escaped in YAML.

### Connection Refused

```
Error: connect ECONNREFUSED
```

**Solutions**:

- Check the server is running and accessible
- Verify the URL and port are correct
- Check firewall rules

## Certificate Formats

### PEM Format

Text format with headers:

```
-----BEGIN CERTIFICATE-----
MIIEpDCCA4ygAwIBAgI...
-----END CERTIFICATE-----
```

### PFX/PKCS12 Format

Binary format containing both certificate and private key. Usually has `.pfx` or `.p12` extension.

### Converting Between Formats

```bash
# Convert PFX to PEM
openssl pkcs12 -in cert.pfx -out cert.pem -nodes

# Convert PEM to PFX
openssl pkcs12 -export -out cert.pfx -in cert.pem -inkey key.pem

# View certificate details
openssl x509 -in cert.pem -text -noout
```

## Advanced Configuration

### Custom Cipher Suites

```yaml
tls:
  ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256'
  minVersion: 'TLSv1.2'
  maxVersion: 'TLSv1.3'
```

### Server Name Indication (SNI)

```yaml
tls:
  servername: api.example.com # Override the SNI hostname
```

### Certificate Arrays

For providing multiple certificates in a chain:

```yaml
tls:
  ca:
    - file://certs/root-ca.pem
    - file://certs/intermediate-ca.pem
```

## Related Examples

- `http-provider` - Basic HTTP provider usage
- `custom-provider` - Creating custom providers
- `azure-openai` - Azure OpenAI with custom endpoints

## Further Reading

- [HTTP Provider Documentation](https://promptfoo.dev/docs/providers/http)
- [TLS/SSL in Node.js](https://nodejs.org/api/tls.html)
- [Understanding mTLS](https://www.cloudflare.com/learning/access-management/what-is-mutual-tls/)
