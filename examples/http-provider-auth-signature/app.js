const express = require('express');
const { providers } = require('promptfoo');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(express.json());

// Add signature validation configuration
const SIGNATURE_CONFIG = {
  publicKeyPath: './public_key.pem',
  signatureHeader: 'signature',
  timestampHeader: 'timestamp',
  clientIdHeader: 'client-id',
  signatureValidityMs: 300000, // 5 minutes
  signatureDataTemplate: 'promptfoo-app{{timestamp}}',
  signatureAlgorithm: 'SHA256',
};

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

    // Verify signature
    const publicKey = fs.readFileSync(SIGNATURE_CONFIG.publicKeyPath, 'utf8');
    const verify = crypto.createVerify(SIGNATURE_CONFIG.signatureAlgorithm);
    verify.update(signatureData);
    const isValid = verify.verify(publicKey, signature, 'base64');

    if (!isValid) {
      console.warn('Request rejected: Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('Signature checks out... continuing');
    next();
  } catch (error) {
    console.error('Error validating signature:', error);
    return res.status(500).json({ error: 'Error validating signature' });
  }
}

app.post('/chat', validateSignature, async (req, res) => {
  try {
    return res.json({ message: 'hello' });
  } catch (error) {
    console.error('Error processing chat request:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 2345;
app.listen(PORT, () => {
  console.info(`Server is running on port ${PORT}`);
});
