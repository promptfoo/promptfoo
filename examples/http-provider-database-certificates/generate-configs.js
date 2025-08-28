const fs = require('fs');

console.log('🔧 Generating promptfoo configurations with actual certificate content...');

try {
  // Check if certificates exist
  const requiredFiles = ['certificate.pfx', 'certificate.crt', 'private.key'];
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
  
  if (missingFiles.length > 0) {
    console.error('❌ Missing certificate files:', missingFiles.join(', '));
    console.error('Run: npm run setup-certs');
    process.exit(1);
  }

  // Read certificate files
  console.log('📖 Reading certificate files...');
  const pfxContent = fs.readFileSync('./certificate.pfx');
  const certContent = fs.readFileSync('./certificate.crt', 'utf8');
  const keyContent = fs.readFileSync('./private.key', 'utf8');

  // Convert to base64
  const pfxBase64 = pfxContent.toString('base64');
  const certBase64 = Buffer.from(certContent).toString('base64');
  const keyBase64 = Buffer.from(keyContent).toString('base64');

  console.log('✅ Certificate content loaded:');
  console.log(`   PFX: ${pfxBase64.length} characters`);
  console.log(`   Cert: ${certBase64.length} characters`);
  console.log(`   Key: ${keyBase64.length} characters`);

  // Generate PFX content configuration
  const pfxContentConfig = `# Configuration using base64-encoded PFX certificate content (database-style)
# This demonstrates how certificates would be stored and used from a database

description: 'HTTP Provider with PFX Certificate Content (Database-Style)'

providers:
  - id: http
    config:
      url: https://localhost:3456/chat
      method: POST
      headers:
        Content-Type: application/json
        User-Agent: promptfoo-database-cert-test
      body:
        prompt: "{{prompt}}"
        user: test-user
      signatureAuth:
        type: pfx
        # This base64 content simulates what would be stored in a database
        pfxContent: "${pfxBase64}"
        pfxPassword: testpassword
        signatureAlgorithm: SHA256
        signatureValidityMs: 300000
        signatureDataTemplate: 'promptfoo-db-test{{signatureTimestamp}}'

prompts:
  - "Hello, can you introduce yourself?"
  - "What is the capital of France?"
  - "Tell me a fun fact about space!"
  - "How does certificate authentication work?"

tests:
  - description: "Should return hello world message"
    assert:
      - type: contains
        value: "Hello World"
      - type: contains 
        value: "database-stored certificates"

  - description: "Should include authentication metadata"
    assert:
      - type: contains
        value: "authenticated"
      - type: contains
        value: "database"

  - description: "Should be a valid JSON response"
    assert:
      - type: is-json

  - description: "Response should include the prompt"
    assert:
      - type: javascript
        value: |
          const response = JSON.parse(output);
          return response.metadata && response.metadata.prompt === vars.prompt;

defaultTest:
  assert:
    - type: latency
      threshold: 5000  # Should respond within 5 seconds`;

  // Generate cert/key content configuration
  const certKeyContentConfig = `# Configuration using separate base64-encoded certificate and key content (database-style)
# This demonstrates an alternative database storage approach using separate cert/key

description: 'HTTP Provider with Separate Certificate and Key Content (Database-Style)'

providers:
  - id: http
    config:
      url: https://localhost:3456/chat
      method: POST
      headers:
        Content-Type: application/json
        User-Agent: promptfoo-database-cert-key-test
      body:
        prompt: "{{prompt}}"
        user: test-user
      signatureAuth:
        type: pfx
        # These base64 contents simulate separate database columns for cert and key
        certContent: "${certBase64}"
        keyContent: "${keyBase64}"
        signatureAlgorithm: SHA256
        signatureValidityMs: 300000
        signatureDataTemplate: 'promptfoo-db-test{{signatureTimestamp}}'

prompts:
  - "Hello from the cert/key content test!"
  - "What's different about this configuration?"
  - "How are certificates managed in the database?"
  - "Show me the authentication details!"

tests:
  - description: "Should return hello world message"
    assert:
      - type: contains
        value: "Hello World"

  - description: "Should include certificate source metadata"
    assert:
      - type: contains
        value: "database"

  - description: "Should be a valid JSON response"
    assert:
      - type: is-json

  - description: "Authentication should be successful"
    assert:
      - type: javascript
        value: |
          const response = JSON.parse(output);
          return response.metadata && response.metadata.authenticated === true;

defaultTest:
  assert:
    - type: latency
      threshold: 5000`;

  // Write configuration files
  fs.writeFileSync('promptfooconfig-pfx-content.yaml', pfxContentConfig);
  fs.writeFileSync('promptfooconfig-cert-key-content.yaml', certKeyContentConfig);

  console.log('');
  console.log('✅ Generated configuration files with actual certificate content:');
  console.log('   📄 promptfooconfig-pfx-content.yaml     - Uses PFX content from database');
  console.log('   📄 promptfooconfig-cert-key-content.yaml - Uses separate cert/key content');
  console.log('   📄 promptfooconfig-files.yaml           - Uses traditional file paths');
  console.log('');
  console.log('🎯 Ready for testing! Start the server with: npm start');
  console.log('   Then test with: NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-pfx-content.yaml --no-cache');

} catch (error) {
  console.error('❌ Error generating configurations:', error.message);
  process.exit(1);
}