#!/bin/bash

# Generate self-signed certificates for testing TLS configurations
# WARNING: These certificates are for testing only, not for production!

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Generating test certificates for TLS example${NC}"
echo -e "${YELLOW}⚠️  WARNING: These certificates are for testing only!${NC}\n"

# Create certs directory
mkdir -p certs
cd certs

# Certificate configuration
DAYS_VALID=365
KEY_SIZE=2048
COUNTRY="US"
STATE="California"
LOCALITY="San Francisco"
ORG="Promptfoo Test"
OU="Development"

# Generate CA private key
echo -e "${GREEN}1. Generating CA private key...${NC}"
openssl genrsa -out ca-key.pem $KEY_SIZE

# Generate CA certificate
echo -e "${GREEN}2. Generating CA certificate...${NC}"
openssl req -new -x509 -key ca-key.pem -out ca-cert.pem -days $DAYS_VALID \
  -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORG/OU=$OU/CN=Promptfoo Test CA"

# Generate server private key
echo -e "${GREEN}3. Generating server private key...${NC}"
openssl genrsa -out server-key.pem $KEY_SIZE

# Generate server certificate signing request
echo -e "${GREEN}4. Generating server CSR...${NC}"
cat >server.cnf <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = $COUNTRY
ST = $STATE
L = $LOCALITY
O = $ORG
OU = $OU
CN = localhost

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

openssl req -new -key server-key.pem -out server.csr -config server.cnf

# Sign server certificate with CA
echo -e "${GREEN}5. Signing server certificate with CA...${NC}"
openssl x509 -req -in server.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out server-cert.pem -days $DAYS_VALID \
  -extensions v3_req -extfile server.cnf

# Generate client private key
echo -e "${GREEN}6. Generating client private key...${NC}"
openssl genrsa -out client-key.pem $KEY_SIZE

# Generate client certificate signing request
echo -e "${GREEN}7. Generating client CSR...${NC}"
openssl req -new -key client-key.pem -out client.csr \
  -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORG/OU=$OU/CN=Test Client"

# Sign client certificate with CA
echo -e "${GREEN}8. Signing client certificate with CA...${NC}"
openssl x509 -req -in client.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out client-cert.pem -days $DAYS_VALID

# Generate PFX bundle from client cert and key
echo -e "${GREEN}9. Creating PFX bundle...${NC}"
openssl pkcs12 -export -out client.pfx \
  -inkey client-key.pem -in client-cert.pem \
  -certfile ca-cert.pem -password pass:testpassword

# Clean up temporary files
rm -f *.csr *.cnf *.srl

# Display certificate information
echo -e "\n${GREEN}✅ Certificates generated successfully!${NC}"
echo -e "\nGenerated files:"
echo "  📄 ca-cert.pem       - Certificate Authority certificate"
echo "  🔑 ca-key.pem        - CA private key (keep secure!)"
echo "  📄 server-cert.pem   - Server certificate"
echo "  🔑 server-key.pem    - Server private key"
echo "  📄 client-cert.pem   - Client certificate"
echo "  🔑 client-key.pem    - Client private key"
echo "  📦 client.pfx        - Client certificate bundle (password: testpassword)"

echo -e "\n${YELLOW}Certificate Details:${NC}"
echo "CA Certificate:"
openssl x509 -in ca-cert.pem -noout -subject -dates | sed 's/^/  /'
echo -e "\nServer Certificate:"
openssl x509 -in server-cert.pem -noout -subject -dates | sed 's/^/  /'
echo -e "\nClient Certificate:"
openssl x509 -in client-cert.pem -noout -subject -dates | sed 's/^/  /'

echo -e "\n${GREEN}You can now test the TLS configuration with:${NC}"
echo "  1. Start the mock server: node ../mock-server.js"
echo "  2. Run the evaluation: npm run local -- eval -c ../promptfooconfig-mock.yaml"
