const express = require('express');
const { providers } = require('promptfoo');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(express.json());

// Add signature validation configuration for PFX
const SIGNATURE_CONFIG = {
  pfxPath: './certificate.pfx',
  pfxPassword: 'password', // In real apps, use environment variables
  signatureHeader: 'signature',
  timestampHeader: 'timestamp',
  clientIdHeader: 'client-id',
  signatureValidityMs: 300000, // 5 minutes
  signatureDataTemplate: 'promptfoo-app{{timestamp}}',
  signatureAlgorithm: 'SHA256',
};

// Load PFX certificate and extract public key
let publicKey;
try {
  const pfxData = fs.readFileSync(SIGNATURE_CONFIG.pfxPath);
  const pfx = crypto.createPKCS12(pfxData, SIGNATURE_CONFIG.pfxPassword);

  // Extract the certificate from PFX
  if (!pfx.cert) {
    throw new Error('No certificate found in PFX file');
  }

  // Create X509Certificate object and extract public key
  const x509 = new crypto.X509Certificate(pfx.cert);
  publicKey = x509.publicKey;

  console.log('Successfully loaded PFX certificate and extracted public key');
} catch (error) {
  console.error('Error loading PFX certificate:', error.message);
  console.error('Make sure certificate.pfx exists and password is correct');
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

    // Verify signature using the public key from PFX
    const verify = crypto.createVerify(SIGNATURE_CONFIG.signatureAlgorithm);
    verify.update(signatureData);
    const isValid = verify.verify(publicKey, signature, 'base64');

    if (!isValid) {
      console.warn('Request rejected: Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('PFX signature checks out... continuing');
    next();
  } catch (error) {
    console.error('Error validating signature:', error);
    return res.status(500).json({ error: 'Error validating signature' });
  }
}

app.post('/chat', validateSignature, async (req, res) => {
  try {
    return res.json({ message: 'hello from PFX authenticated endpoint' });
  } catch (error) {
    console.error('Error processing chat request:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 2347;
app.listen(PORT, (error) => {
  if (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
    return;
  }
  console.info(`PFX server is running on port ${PORT}`);
});
