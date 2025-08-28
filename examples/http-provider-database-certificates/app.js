const express = require('express');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Mock database certificate content (base64 encoded)
// In a real application, this would come from a database query
let MOCK_DATABASE_CERTS = null;

// Signature validation configuration
const SIGNATURE_CONFIG = {
  signatureHeader: 'signature',
  timestampHeader: 'timestamp',
  clientIdHeader: 'client-id',
  signatureValidityMs: 300000, // 5 minutes
  signatureDataTemplate: 'promptfoo-db-test{{timestamp}}',
  signatureAlgorithm: 'SHA256',
};

// HTTPS options using separate cert and key files for the server
// (The PFX is still available for clients to test with)
const HTTPS_OPTIONS = {
  cert: fs.readFileSync('./certificate.crt'),
  key: fs.readFileSync('./private.key'),
};

// Public key for signature verification (loaded from certificate)
let publicKey;

// Simulate loading certificate content from database
function loadCertificatesFromDatabase() {
  console.log('📚 Loading certificates from mock database...');

  try {
    // In a real app, this would be a database query like:
    // SELECT certificate_content, certificate_password FROM providers WHERE id = ?

    // For demo purposes, we'll read the files and base64 encode them
    const pfxContent = fs.readFileSync('./certificate.pfx');
    const certContent = fs.readFileSync('./certificate.crt', 'utf8');
    const keyContent = fs.readFileSync('./private.key', 'utf8');

    MOCK_DATABASE_CERTS = {
      // This simulates what would be stored in the database
      pfxContent: pfxContent.toString('base64'),
      pfxPassword: 'testpassword',
      certContent: Buffer.from(certContent).toString('base64'),
      keyContent: Buffer.from(keyContent).toString('base64'),
    };

    console.log('✅ Mock database certificates loaded');
    console.log(`   - PFX content: ${MOCK_DATABASE_CERTS.pfxContent.length} characters`);
    console.log(`   - Cert content: ${MOCK_DATABASE_CERTS.certContent.length} characters`);
    console.log(`   - Key content: ${MOCK_DATABASE_CERTS.keyContent.length} characters`);
  } catch (error) {
    console.error('❌ Error loading certificates for mock database:', error.message);
    throw error;
  }
}

// Extract public key from database-stored certificate content
function extractPublicKeyFromDatabaseCert() {
  console.log('🔑 Extracting public key from database certificate content...');

  try {
    // Simulate what the HTTP provider would do when receiving database certificate content
    const certPemContent = Buffer.from(MOCK_DATABASE_CERTS.certContent, 'base64').toString('utf8');

    // Extract public key from the certificate
    publicKey = crypto.createPublicKey(certPemContent);
    console.log('✅ Successfully extracted public key from database certificate content');
  } catch (error) {
    throw new Error(`Error creating public key from database cert: ${error.message}`);
  }
}

// Signature validation middleware
function validateSignature(req, res, next) {
  try {
    const signature = req.headers[SIGNATURE_CONFIG.signatureHeader];
    const timestamp = req.headers[SIGNATURE_CONFIG.timestampHeader];
    const clientId = req.headers[SIGNATURE_CONFIG.clientIdHeader];

    // Check if all required headers are present
    if (!signature || !timestamp || !clientId) {
      console.warn('❌ Request rejected: Missing signature headers');
      return res.status(401).json({
        error: 'Missing signature headers',
        required: ['signature', 'timestamp', 'client-id'],
      });
    }

    // Check timestamp validity
    const now = Date.now();
    const requestTime = Number.parseInt(timestamp, 10);

    if (Number.isNaN(requestTime) || now - requestTime > SIGNATURE_CONFIG.signatureValidityMs) {
      console.warn('❌ Request rejected: Signature expired or invalid timestamp');
      return res.status(401).json({
        error: 'Signature expired or invalid timestamp',
        maxAge: `${SIGNATURE_CONFIG.signatureValidityMs}ms`,
      });
    }

    // Generate signature data using the template
    const signatureData = SIGNATURE_CONFIG.signatureDataTemplate.replace(
      '{{timestamp}}',
      timestamp,
    );

    // Verify signature using the public key extracted from database certificate
    const verify = crypto.createVerify(SIGNATURE_CONFIG.signatureAlgorithm);
    verify.update(signatureData);
    const isValid = verify.verify(publicKey, signature, 'base64');

    if (!isValid) {
      console.warn('❌ Request rejected: Invalid signature');
      console.warn(`   Expected signature data: "${signatureData}"`);
      return res.status(401).json({
        error: 'Invalid signature',
        signatureData: signatureData,
        algorithm: SIGNATURE_CONFIG.signatureAlgorithm,
      });
    }

    console.log('✅ Database certificate signature verified successfully');
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Signature data: "${signatureData}"`);
    next();
  } catch (error) {
    console.error('💥 Error validating signature:', error);
    return res.status(500).json({ error: 'Error validating signature' });
  }
}

// Main chat endpoint that requires certificate authentication
app.post('/chat', validateSignature, async (req, res) => {
  try {
    const { prompt } = req.body;

    console.log('💬 Processing authenticated chat request');
    console.log(`   Prompt: "${prompt}"`);

    // Simple hello world response with some dynamic content
    const responses = [
      'Hello World! This response was authenticated using database-stored certificates! 🔐',
      'Greetings from the secure endpoint! Your certificate worked perfectly! ✨',
      'Certificate authentication successful! Welcome to the protected API! 🛡️',
      'Database-stored certificates are working great! Hello there! 👋',
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return res.json({
      message: randomResponse,
      metadata: {
        authenticated: true,
        certificateSource: 'database',
        prompt: prompt || 'No prompt provided',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('💥 Error processing chat request:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Mock server running with database certificate support',
    certificateLoaded: !!publicKey,
    port: PORT,
  });
});

// API info endpoint
app.get('/info', (req, res) => {
  res.json({
    name: 'Database Certificate Mock Server',
    description: 'Demonstrates HTTP provider authentication using database-stored certificates',
    endpoints: {
      'POST /chat': 'Main endpoint - requires certificate signature authentication',
      'GET /health': 'Health check - no authentication required',
      'GET /info': 'API information - no authentication required',
    },
    signatureAuth: {
      requiredHeaders: ['signature', 'timestamp', 'client-id'],
      algorithm: SIGNATURE_CONFIG.signatureAlgorithm,
      template: SIGNATURE_CONFIG.signatureDataTemplate,
      validityMs: SIGNATURE_CONFIG.signatureValidityMs,
    },
    certificateFormats: [
      'pfxContent - Base64 encoded PFX certificate data',
      'certContent + keyContent - Base64 encoded certificate and private key',
      'pfxPath - Traditional file path (for comparison)',
    ],
  });
});

const PORT = process.env.PORT || 3456;

// Initialize the server
async function startServer() {
  try {
    console.log('🚀 Starting Database Certificate Mock Server...');
    console.log('====================================================');

    // Step 1: Load certificates from "database" (simulated)
    loadCertificatesFromDatabase();

    // Step 2: Extract public key from database certificate content
    extractPublicKeyFromDatabaseCert();

    // Step 3: Start HTTPS server
    console.log('🌐 Starting HTTPS server...');
    https.createServer(HTTPS_OPTIONS, app).listen(PORT, (error) => {
      if (error) {
        console.error(`❌ Failed to start HTTPS server: ${error.message}`);
        process.exit(1);
        return;
      }

      console.log('✅ Database Certificate Mock Server is running!');
      console.log('================================================');
      console.log(`📡 Server URL: https://localhost:${PORT}`);
      console.log('🔐 Certificate authentication: ENABLED');
      console.log('💾 Certificate source: Database simulation');
      console.log('');
      console.log('Available endpoints:');
      console.log(`  POST https://localhost:${PORT}/chat     - Main API (requires cert auth)`);
      console.log(`  GET  https://localhost:${PORT}/health   - Health check`);
      console.log(`  GET  https://localhost:${PORT}/info     - API information`);
      console.log('');
      console.log('To test with promptfoo:');
      console.log(
        '  NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-pfx-content.yaml --no-cache',
      );
      console.log('');
      console.log('Ready for testing! 🎯');
    });
  } catch (error) {
    console.error('💥 Error starting server:', error.message);
    console.error('');
    console.error('Make sure you have run: npm run setup-certs');
    console.error('This creates the required certificate files.');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Server shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Server shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();
