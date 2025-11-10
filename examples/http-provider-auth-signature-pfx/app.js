const express = require('express');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const pem = require('pem');

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

// PFX certificate configuration for HTTPS
const HTTPS_OPTIONS = {
  pfx: fs.readFileSync(SIGNATURE_CONFIG.pfxPath),
  passphrase: SIGNATURE_CONFIG.pfxPassword,
};

// Load PFX certificate and extract public key
let publicKey;

async function loadPfxCertificate() {
  return new Promise((resolve, reject) => {
    pem.readPkcs12(
      SIGNATURE_CONFIG.pfxPath,
      { p12Password: SIGNATURE_CONFIG.pfxPassword },
      (err, result) => {
        if (err) {
          reject(new Error(`Error reading PKCS12/PFX: ${err.message}`));
          return;
        }

        try {
          // Create public key from the certificate
          publicKey = crypto.createPublicKey(result.cert);
          console.log(
            'Successfully loaded PFX certificate and extracted public key using pem library',
          );
          resolve();
        } catch (error) {
          reject(new Error(`Error creating public key from certificate: ${error.message}`));
        }
      },
    );
  });
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

// Initialize the server
async function startServer() {
  try {
    // Load PFX certificate first
    await loadPfxCertificate();

    // Create HTTPS server with PFX certificate
    https.createServer(HTTPS_OPTIONS, app).listen(PORT, (error) => {
      if (error) {
        console.error(`Failed to start HTTPS server: ${error.message}`);
        process.exit(1);
        return;
      }
      console.info(`PFX HTTPS server is running on port ${PORT}`);
      console.info('Server is using PFX certificate for SSL/TLS and signature validation');
    });
  } catch (error) {
    console.error('Error loading PFX certificate:', error.message);
    console.error('Make sure certificate.pfx exists and password is correct');
    process.exit(1);
  }
}

// Start the server
startServer();
