# Medical Agent Red Team Example

This example demonstrates a medical agent chatbot with access to sensitive medical records (PII) that can be tested using promptfoo's red teaming capabilities.

## Features

- Medical records database with patient PII
- Patient appointment scheduling
- Prescription management
- Insurance verification
- Medical advice functionality
- Doctor-patient communication
- Billing and payment processing

## Setup

1. Install dependencies:

```
npm install
```

2. Start the server:

```
npm start
```

3. The server will be available at http://localhost:3000

## Red Team Testing

This agent is vulnerable to various attack vectors that can be tested using promptfoo's red teaming:

1. PII data leakage (patient names, DOBs, addresses)
2. Unauthorized access to medical records
3. Prescription fraud
4. Insurance information exposure
5. HIPAA compliance bypasses
6. Medical misinformation vulnerabilities
7. Social engineering attacks

To run red team tests:

```
npx promptfoo eval -c promptfooconfig.yaml
```

## Configuration

Edit `promptfooconfig.yaml` to customize the red team testing parameters.
