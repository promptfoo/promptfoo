# http-provider-database-certificates (HTTP provider with database-stored certificates)

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-database-certificates
```

## Introduction

This example demonstrates how to use HTTP provider authentication with certificates stored as base64-encoded content in a database or configuration, rather than as files on the filesystem. This is particularly useful for cloud deployments where certificates need to be stored securely in databases.

The example shows support for:

1. **PFX certificates with content** - Base64-encoded PFX data
2. **Separate certificate and key content** - Base64-encoded cert and key data
3. **Traditional file-based certificates** - For comparison

## Prerequisites

- Node.js 20.0.0 or higher
- A certificate for testing (the setup script will create one for you)

## Setup

### Installation

1. Install dependencies:

```bash
npm install
```

1. **Generate test certificates**:

```bash
npm run setup-certs
```

This will create:

- `certificate.pfx` - PFX certificate file (password: `testpassword`)
- `certificate.crt` - Public certificate in PEM format
- `private.key` - Private key in PEM format

1. **Start the mock server**:

```bash
npm start
```

The server will start on port 3456 and accept requests with certificate-based signatures.

## Configuration Options

The example includes three configuration files demonstrating different certificate storage methods:

### Option A: PFX Content (`promptfooconfig-pfx-content.yaml`)

Uses base64-encoded PFX certificate content directly in the configuration:

```yaml
providers:
  - id: http
    config:
      url: https://localhost:3456/chat
      method: POST
      headers:
        Content-Type: application/json
      body:
        prompt: '{{prompt}}'
      signatureAuth:
        type: pfx
        pfxContent: 'MIIKXAIBAzCCChgGCSqGSIb3DQEHAaCC...' # Base64 PFX content
        pfxPassword: testpassword
        signatureAlgorithm: SHA256
        signatureValidityMs: 300000
        signatureDataTemplate: 'promptfoo-db-test{{signatureTimestamp}}'
```

### Option B: Separate Cert/Key Content (`promptfooconfig-cert-key-content.yaml`)

Uses base64-encoded certificate and private key content:

```yaml
providers:
  - id: http
    config:
      url: https://localhost:3456/chat
      method: POST
      headers:
        Content-Type: application/json
      body:
        prompt: '{{prompt}}'
      signatureAuth:
        type: pfx
        certContent: 'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...' # Base64 cert content
        keyContent: 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...' # Base64 key content
        signatureAlgorithm: SHA256
        signatureValidityMs: 300000
        signatureDataTemplate: 'promptfoo-db-test{{signatureTimestamp}}'
```

### Option C: Traditional File-based (`promptfooconfig-files.yaml`)

Uses traditional file paths for comparison:

```yaml
providers:
  - id: http
    config:
      url: https://localhost:3456/chat
      method: POST
      headers:
        Content-Type: application/json
      body:
        prompt: '{{prompt}}'
      signatureAuth:
        type: pfx
        pfxPath: ./certificate.pfx
        pfxPassword: testpassword
        signatureAlgorithm: SHA256
        signatureValidityMs: 300000
        signatureDataTemplate: 'promptfoo-db-test{{signatureTimestamp}}'
```

## Running Tests

Set `NODE_TLS_REJECT_UNAUTHORIZED=0` since we're using self-signed certificates for testing:

```bash
# Test with PFX content (database-style)
NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-pfx-content.yaml --no-cache

# Test with separate cert/key content
NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-cert-key-content.yaml --no-cache

# Test with traditional file-based approach (for comparison)
NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-files.yaml --no-cache

# View results
promptfoo view
```

**IMPORTANT**: Always use `--no-cache` when testing signatures to ensure fresh signature generation!

## How Database Certificate Storage Works

### Traditional File-Based Approach

```yaml
signatureAuth:
  type: pfx
  pfxPath: ./certificate.pfx # Read from filesystem
  pfxPassword: password
```

### Database-Stored Content Approach

```yaml
signatureAuth:
  type: pfx
  pfxContent: 'MIIKXAIBAzCCC...' # Base64 content from database
  pfxPassword: password
```

### The Transformation Process

1. **Storage**: Certificates are stored as base64-encoded strings in the database
2. **Retrieval**: When loading provider config, certificate content is included inline
3. **Processing**: The HTTP provider decodes base64 content and uses it directly
4. **Signature Generation**: Works identically to file-based certificates

## Production Considerations

### Security Best Practices

- Store certificate passwords in secure environment variables
- Use encrypted database storage for certificate content
- Implement proper access controls for certificate data
- Rotate certificates regularly and update database storage

### Environment Variables

For production deployments, use environment variables:

```bash
PROMPTFOO_PFX_PASSWORD=your_secure_password
```

### Database Integration

In a real application, you would:

1. Store certificate content as base64 in your database:

   ```sql
   INSERT INTO providers (name, certificate_content, certificate_password)
   VALUES ('My API', 'MIIKXAIBAzCCC...', 'encrypted_password');
   ```

1. Transform when serving provider configs:

   ```javascript
   const providerConfig = {
     signatureAuth: {
       type: 'pfx',
       pfxContent: provider.certificate_content, // Base64 from DB
       pfxPassword: decrypt(provider.certificate_password),
       // ... other config
     },
   };
   ```

## Benefits of Database Certificate Storage

1. **Scalability**: No need to sync certificate files across multiple instances
2. **Security**: Centralized certificate management with encryption at rest
3. **Cloud-Native**: Works seamlessly in containerized environments
4. **Auditing**: Database-level tracking of certificate access and changes
5. **Rotation**: Easier certificate rotation through database updates

## Troubleshooting

### Common Issues

1. **Base64 Encoding Errors**: Ensure certificate content is properly base64 encoded
2. **Password Issues**: Verify certificate passwords are correct
3. **Signature Validation**: Check that signature templates match between client and server
4. **Certificate Expiration**: Ensure test certificates haven't expired

### Debugging

Enable debug logging to see certificate loading details:

```bash
DEBUG=promptfoo* NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-pfx-content.yaml --no-cache
```

## Comparison with File-Based Approach

| Aspect          | File-Based             | Database Content       |
| --------------- | ---------------------- | ---------------------- |
| **Deployment**  | Files must be present  | No file dependencies   |
| **Scaling**     | File sync required     | Automatic via database |
| **Security**    | Filesystem permissions | Database encryption    |
| **Cloud Ready** | Requires volume mounts | Native cloud support   |
| **Rotation**    | File replacement       | Database update        |
| **Auditing**    | Filesystem logs        | Database audit logs    |

This example demonstrates that both approaches work identically from a functionality perspective, but database storage provides significant advantages for modern cloud deployments.
