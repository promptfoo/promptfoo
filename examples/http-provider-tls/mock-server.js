/**
 * Mock HTTPS Server for testing TLS certificate configurations
 *
 * This server demonstrates:
 * - HTTPS with self-signed certificates
 * - Client certificate verification (mTLS)
 * - Custom TLS options
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 8443;
const REQUIRE_CLIENT_CERT = process.env.REQUIRE_CLIENT_CERT === 'true';

// Server options
const serverOptions = {
  // Server certificate and key (self-signed for testing)
  key: fs.readFileSync(path.join(__dirname, 'certs', 'server-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'server-cert.pem')),
};

// Add client certificate verification for mTLS
if (REQUIRE_CLIENT_CERT) {
  serverOptions.requestCert = true;
  serverOptions.rejectUnauthorized = true;
  serverOptions.ca = fs.readFileSync(path.join(__dirname, 'certs', 'ca-cert.pem'));
  console.log('📋 Client certificate verification enabled (mTLS)');
}

// Create HTTPS server
const server = https.createServer(serverOptions, (req, res) => {
  let body = '';

  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    console.log(`📥 ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);

    if (body) {
      try {
        const parsed = JSON.parse(body);
        console.log('Body:', parsed);
      } catch {
        console.log('Body (raw):', body);
      }
    }

    // Check for client certificate
    if (req.socket.getPeerCertificate) {
      const cert = req.socket.getPeerCertificate();
      if (cert && cert.subject) {
        console.log('✅ Client certificate:', cert.subject);
      }
    }

    // Simulate API response
    const response = {
      result: `Mock response for: ${body ? JSON.parse(body).prompt || JSON.parse(body).message || JSON.parse(body).input || 'no prompt' : 'no body'}`,
      timestamp: new Date().toISOString(),
      tls: {
        cipher: req.socket.getCipher(),
        protocol: req.socket.getProtocol(),
        clientCert: req.socket.authorized ? 'verified' : 'none',
      },
    };

    // For OpenAI-style responses
    if (req.url.includes('/chat/completions')) {
      response.choices = [
        {
          message: {
            content: response.result,
            role: 'assistant',
          },
          finish_reason: 'stop',
        },
      ];
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Mock HTTPS server running on https://localhost:${PORT}`);
  console.log(`🔐 TLS Configuration:`);
  console.log(`   - Protocol versions: TLS 1.2+`);
  console.log(`   - Client certificates: ${REQUIRE_CLIENT_CERT ? 'Required' : 'Not required'}`);
  console.log(`\n📝 Test with:`);
  console.log(`   curl -k https://localhost:${PORT}/test`);
  if (REQUIRE_CLIENT_CERT) {
    console.log(
      `   curl --cert certs/client-cert.pem --key certs/client-key.pem --cacert certs/ca-cert.pem https://localhost:${PORT}/test`,
    );
  }
});

// Handle errors
server.on('tlsClientError', (err, socket) => {
  console.error('❌ TLS Client Error:', err.message);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
});
