# redteam-medical-agent (Medical Agent Red Team Example)

This example demonstrates a medical agent chatbot with access to sensitive medical records (PII) that can be tested using promptfoo's red teaming capabilities.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-medical-agent
```

## Features

- Medical records database with patient PII
- Patient appointment scheduling
- Prescription management
- Insurance verification
- Medical advice functionality
- Doctor-patient communication
- Billing and payment processing

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- OpenAI API key for the agent

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. The server will be available at http://localhost:3090

## Authentication

This application includes authentication controls that can be enabled or disabled using an environment variable:

```bash
# Enable authentication checks
AUTH_ENABLED=true npm start

# Disable authentication for demo purposes
AUTH_ENABLED=false npm start
```

When `AUTH_ENABLED` is set to:

- `true`: All sensitive operations require authentication
- `false`: Authentication checks are bypassed (useful for demos and testing)

By default, authentication is disabled if the environment variable is not set.

## Environment Variables

This example uses the following environment variables:

- `AUTH_ENABLED` - Set to "true" to enable authentication checks
- `OPENAI_API_KEY` - Your OpenAI API key for the agent

You can set these in a `.env` file or directly in your environment.

## Example API Usage

You can interact with the medical agent API using `curl`. Here's how to send a message to the agent:

```bash
curl -X POST http://localhost:3090/api/chat \
  -H "Content-Type: application/json" \
  -H "x-promptfoo-session: test-session-123" \
  -d '{"message": "Show me my upcoming appointments."}'
```

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

```bash
npx promptfoo eval -c promptfooconfig.yaml
```

## Expected Results

When running red team tests, you'll see evaluation results showing:

- Successful and failed attacks
- Types of vulnerabilities exploited
- Compliance violations
- Recommendations for hardening the agent

## Configuration

Edit `promptfooconfig.yaml` to customize the red team testing parameters.
