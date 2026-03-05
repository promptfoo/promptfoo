const express = require('express');
const { providers } = require('promptfoo');
const crypto = require('crypto');
const fs = require('fs');
const jks = require('jks-js');

const app = express();
app.use(express.json());

// Add signature validation configuration for JKS
const SIGNATURE_CONFIG = {
  keystorePath: './clientkeystore.jks',
  keystorePassword: 'password', // In real apps, use environment variables
  keyAlias: 'client', // Common alias for client certificates
  keyPassword: 'password', // In real apps, use environment variables
  signatureHeader: 'signature',
  timestampHeader: 'timestamp',
  clientIdHeader: 'client-id',
  signatureValidityMs: 300000, // 5 minutes
  signatureDataTemplate: 'promptfoo-app{{timestamp}}',
  signatureAlgorithm: 'SHA256',
};

// Load JKS keystore and extract public key
let publicKey;
try {
  const keystoreData = fs.readFileSync(SIGNATURE_CONFIG.keystorePath);
  const keystore = jks.toPem(keystoreData, SIGNATURE_CONFIG.keystorePassword);

  // Find the certificate by alias
  const cert = keystore[SIGNATURE_CONFIG.keyAlias];
  if (!cert) {
    throw new Error(`Certificate with alias '${SIGNATURE_CONFIG.keyAlias}' not found in keystore`);
  }

  publicKey = cert.cert;
  console.log('Successfully loaded JKS keystore and extracted public key');
} catch (error) {
  console.error('Error loading JKS keystore:', error.message);
  console.error('Make sure keystore.jks exists and credentials are correct');
  process.exit(1);
}

// Signature validation middleware
function validateSignature(req, res, next) {
  try {
    const signature = req.headers[SIGNATURE_CONFIG.signatureHeader];
    const timestamp = req.headers[SIGNATURE_CONFIG.timestampHeader];
    const clientId = req.headers[SIGNATURE_CONFIG.clientIdHeader];

    // Check if all required headers are present
    if (!signature || !timestamp || !clientId) {
      console.warn('Request rejected: Missing signature headers');
      return res.status(401).json({ error: 'Missing signature headers' });
    }

    // Check timestamp validity
    const now = Date.now();
    const requestTime = Number.parseInt(timestamp, 10);

    if (Number.isNaN(requestTime) || now - requestTime > SIGNATURE_CONFIG.signatureValidityMs) {
      console.warn('Request rejected: Signature expired or invalid timestamp');
      return res.status(401).json({ error: 'Signature expired or invalid timestamp' });
    }

    // Generate signature data using the template
    const signatureData = SIGNATURE_CONFIG.signatureDataTemplate.replace(
      '{{timestamp}}',
      timestamp,
    );

    // Verify signature using the public key from JKS
    const verify = crypto.createVerify(SIGNATURE_CONFIG.signatureAlgorithm);
    verify.update(signatureData);
    const isValid = verify.verify(publicKey, signature, 'base64');

    if (!isValid) {
      console.warn('Request rejected: Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('JKS signature checks out... continuing');
    next();
  } catch (error) {
    console.error('Error validating signature:', error);
    return res.status(500).json({ error: 'Error validating signature' });
  }
}

app.post('/chat', validateSignature, async (req, res) => {
  try {
    return res.json({ message: 'hello from JKS authenticated endpoint' });
  } catch (error) {
    console.error('Error processing chat request:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 2346;
app.listen(PORT, (error) => {
  if (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
    return;
  }
  console.info(`JKS server is running on port ${PORT}`);
});
