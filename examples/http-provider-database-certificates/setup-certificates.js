const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔧 Setting up test certificates for database certificate example...');
console.log('================================================================');

try {
  // Check if openssl is available
  try {
    execSync('openssl version', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ OpenSSL is not available. Please install OpenSSL to generate certificates.');
    console.error('');
    console.error('On macOS: brew install openssl');
    console.error('On Ubuntu: sudo apt-get install openssl');
    console.error('On Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
    process.exit(1);
  }

  // Clean up any existing certificates
  console.log('🧹 Cleaning up existing certificates...');
  const filesToClean = ['private.key', 'certificate.crt', 'certificate.pfx'];
  filesToClean.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`   Removed: ${file}`);
    }
  });

  // Generate private key and certificate
  console.log('🔑 Generating private key and certificate...');
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout private.key -out certificate.crt -days 365 -nodes -subj "/CN=Database Cert Test/O=Promptfoo Example/C=US"`, {
    stdio: 'inherit'
  });
  console.log('✅ Created: private.key and certificate.crt');

  // Create PFX file from key and certificate
  console.log('📦 Creating PFX certificate file...');
  execSync(`openssl pkcs12 -export -out certificate.pfx -inkey private.key -in certificate.crt -passout pass:testpassword`, {
    stdio: 'inherit'
  });
  console.log('✅ Created: certificate.pfx (password: testpassword)');

  // Verify the certificates were created
  const requiredFiles = ['private.key', 'certificate.crt', 'certificate.pfx'];
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
  
  if (missingFiles.length > 0) {
    console.error(`❌ Missing files: ${missingFiles.join(', ')}`);
    process.exit(1);
  }

  console.log('');
  console.log('🎉 Certificate setup complete!');
  console.log('============================');
  console.log('Created files:');
  console.log('  📄 certificate.crt  - Public certificate (PEM format)');
  console.log('  🔑 private.key      - Private key (PEM format)');
  console.log('  📦 certificate.pfx  - PFX certificate (password: testpassword)');
  console.log('');
  console.log('Next steps:');
  console.log('1. Start the server: npm start');
  console.log('2. Run tests: NODE_TLS_REJECT_UNAUTHORIZED=0 promptfoo eval -c promptfooconfig-pfx-content.yaml --no-cache');
  console.log('');
  console.log('Note: These are self-signed certificates for testing only!');
  
} catch (error) {
  console.error('❌ Error setting up certificates:', error.message);
  console.error('');
  console.error('Make sure OpenSSL is installed and available in your PATH.');
  process.exit(1);
}