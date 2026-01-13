---
title: Evaluating UCP Agents
sidebar_label: UCP Agents
sidebar_position: 50
description: Comprehensive guide to testing AI agents that implement Universal Commerce Protocol (UCP) for checkout, discounts, and fulfillment.
---

# Evaluating UCP Agents

[Universal Commerce Protocol (UCP)](https://ucp.dev/) is an open standard that defines how AI agents conduct commerce transactions. Rather than building custom integrations for each merchant, agents implementing UCP can transact with any UCP-compliant business through a standardized API.

This guide covers how to evaluate UCP agents using promptfoo, including protocol compliance testing, extension validation, and quality scoring.

## Overview

A UCP evaluation tests whether an agent can:

- Discover merchant capabilities and negotiate supported features
- Execute checkout flows through various states (incomplete → ready → completed)
- Handle extensions correctly (discounts, fulfillment options)
- Comply with protocol requirements (headers, idempotency)
- Recover from errors and edge cases gracefully

The example evaluation suite includes 10 test scenarios, custom JavaScript assertions, and OpenTelemetry tracing integration.

```bash
npx promptfoo@latest init --example ucp-agent-evaluation
```

## UCP Protocol Fundamentals

### Architecture

UCP transactions involve three parties:

| Party | Role |
|-------|------|
| **Platform** | Consumer-facing application (AI agent, mobile app) acting on behalf of the user |
| **Business** | Merchant providing goods/services and serving as Merchant of Record |
| **User** | End consumer authorizing the transaction |

### Transaction Flow

Every UCP transaction follows three phases:

**1. Discovery**

The platform fetches the business profile from `/.well-known/ucp`. This JSON document declares the business identity, API endpoints, and supported capabilities.

```bash
curl https://merchant.example/.well-known/ucp
```

**2. Negotiation**

The platform computes the intersection of its capabilities with the business capabilities. Only features supported by both parties are available for the transaction.

**3. Transaction**

The platform executes checkout operations via the REST API. The checkout progresses through a state machine:

```
incomplete ──────► ready_for_complete ──────► completed
     │                                            │
     ▼                                            ▼
requires_escalation                            order created
(hand off to business UI)
```

### Capabilities and Extensions

UCP uses a capability system:

| Type | Example | Description |
|------|---------|-------------|
| **Core Capability** | `dev.ucp.shopping.checkout` | Required for basic transactions |
| **Extension** | `dev.ucp.shopping.discount` | Optional feature that augments checkout |
| **Extension** | `dev.ucp.shopping.fulfillment` | Optional feature for shipping/pickup |

Extensions declare which capability they extend. If the base capability isn't negotiated, extensions are unavailable.

## Prerequisites

### Python Environment

The example agent requires Python 3.10+:

```bash
cd examples/ucp-agent-evaluation
pip install -r requirements.txt
```

Dependencies include:
- `google-adk` - Google's Agent Development Kit
- `google-genai` - Gemini API client
- `requests` - HTTP client for UCP API calls

### Gemini Authentication

The agent uses Gemini for reasoning. Configure one of:

**Option A: Gemini Developer API**
```bash
export GOOGLE_API_KEY=AIza...
```

**Option B: Vertex AI**
```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=us-central1
```

### UCP Merchant Server

The evaluation requires a running UCP server. Use the official sample implementation:

```bash
# Clone repositories
git clone https://github.com/Universal-Commerce-Protocol/samples.git
git clone https://github.com/Universal-Commerce-Protocol/conformance.git
cd samples

# Install dependencies (requires uv: https://docs.astral.sh/uv/)
uv sync --directory rest/python/server/

# Initialize database with test data
DATABASE_PATH=/tmp/ucp_test
mkdir -p ${DATABASE_PATH}

uv run --directory rest/python/server import_csv.py \
  --products_db_path=${DATABASE_PATH}/products.db \
  --transactions_db_path=${DATABASE_PATH}/transactions.db \
  --data_dir=../conformance/test_data/flower_shop

# Start server on port 8182
uv run --directory rest/python/server server.py \
  --products_db_path=${DATABASE_PATH}/products.db \
  --transactions_db_path=${DATABASE_PATH}/transactions.db \
  --port=8182 \
  --simulation_secret=super-secret-sim-key
```

Verify the server is running:

```bash
curl http://localhost:8182/.well-known/ucp | jq '.ucp.capabilities[].name'
```

Expected output:
```
"dev.ucp.shopping.checkout"
"dev.ucp.shopping.discount"
"dev.ucp.shopping.fulfillment"
```

## Agent Architecture

The example agent uses Google's Agent Development Kit (ADK) with Gemini 2.0 Flash:

```python
from google.adk.agents import Agent

agent = Agent(
    name="ucp_checkout_agent",
    model="gemini-2.0-flash-001",
    tools=[
        discover_ucp_server,
        create_checkout,
        get_checkout_status,
        update_checkout_fulfillment,
        update_checkout_buyer,
        complete_checkout,
        report_escalation,
    ],
    instruction="""You are a UCP checkout agent. Execute the checkout flow:
    1. Discover server capabilities
    2. Create checkout with scenario items
    3. Resolve any issues (fulfillment, buyer info)
    4. Complete when ready_for_complete""",
)
```

Each tool wraps a UCP API operation:

| Tool | UCP Operation | Purpose |
|------|---------------|---------|
| `discover_ucp_server` | `GET /.well-known/ucp` | Fetch and parse business profile |
| `create_checkout` | `POST /checkout-sessions` | Initialize checkout with line items |
| `get_checkout_status` | `GET /checkout-sessions/{id}` | Poll current state and messages |
| `update_checkout_fulfillment` | `PUT /checkout-sessions/{id}` | Add shipping/pickup information |
| `update_checkout_buyer` | `PUT /checkout-sessions/{id}` | Add buyer email and name |
| `complete_checkout` | `POST /checkout-sessions/{id}/complete` | Finalize order with payment |
| `report_escalation` | (local) | Handle `requires_escalation` state |

The agent reasons about which tools to invoke based on checkout state and error messages returned by the server.

## Evaluation Configuration

### Provider Setup

The promptfoo provider wraps the agent:

```yaml title="promptfooconfig.yaml"
providers:
  - id: file://provider.py
    label: UCP Agent (REST)
    config:
      transport: rest
      platform_profile_path: platform_profile.json
```

The provider accepts scenario JSON as input and returns a structured result artifact.

### Scenario Format

Test scenarios define the checkout inputs:

```json title="scenarios/checkout_happy_path.json"
{
  "scenario_id": "checkout_happy_path",
  "line_items": [
    { "merchant_item_id": "bouquet_roses", "quantity": 2 }
  ],
  "buyer": {
    "email": "jane.doe@example.com",
    "name": { "given": "Jane", "family": "Doe" }
  },
  "fulfillment": {
    "methods": [{
      "id": "pickup_method",
      "type": "pickup",
      "groups": [{ "id": "pickup_group", "selected_option_id": "store-pickup" }]
    }]
  },
  "discount_codes": [],
  "currency": "USD"
}
```

Available product IDs from the flower shop test data:
- `bouquet_roses`
- `bouquet_tulips`
- `pot_ceramic`
- `orchid_white`
- `gardenias`

### Result Artifact Schema

The agent returns structured JSON for assertions:

```json
{
  "scenario_id": "checkout_happy_path",
  "transport": "rest",
  "success": true,
  "final_status": "completed",
  "checkout_id": "chk_abc123",
  "order_id": "ord_xyz789",
  "currency": "USD",
  "total_amount": 5000,
  "line_items": [
    {
      "merchant_item_id": "bouquet_roses",
      "title": "Red Rose Bouquet",
      "quantity": 2,
      "unit_price": 2500,
      "total": 5000
    }
  ],
  "applied_discounts": [],
  "rejected_discounts": [],
  "requires_escalation": false,
  "continue_url": null,
  "protocol": {
    "ucp_version": "2026-01-11",
    "sent_ucp_agent_header": true,
    "used_idempotency_keys": true
  },
  "metrics": {
    "http_requests": 5,
    "wall_time_ms": 3200
  },
  "transcript": [...],
  "messages_seen": [],
  "error": null
}
```

## Test Scenarios

The evaluation includes scenarios across five categories:

### Protocol Basics

| Scenario | File | Tests |
|----------|------|-------|
| Happy path | `checkout_happy_path.json` | Basic checkout completes successfully |
| Multi-item cart | `multi_item_cart.json` | Multiple line items handled correctly |

### Discount Extension

| Scenario | File | Tests |
|----------|------|-------|
| Valid discount | `discount_valid.json` | Code applies, totals updated |
| Invalid discount | `discount_invalid.json` | Rejection surfaced to user |
| Discount replacement | `discount_replacement.json` | New codes replace old (UCP semantics) |

### Fulfillment Extension

| Scenario | File | Tests |
|----------|------|-------|
| Shipping | `fulfillment_shipping.json` | Address provided, shipping option selected |
| Pickup | `fulfillment_pickup.json` | Store pickup flow |

### Error Handling

| Scenario | Config | Tests |
|----------|--------|-------|
| Missing buyer | Inline YAML | Agent supplies info from scenario |
| Empty cart | Inline YAML | Graceful error handling |

### Quality Scoring

| Scenario | File | Tests |
|----------|------|-------|
| Overall quality | `checkout_happy_path.json` | Weighted rubric evaluation |

## Assertions Reference

### Task Completion

**assertSuccessCompleted** - Verifies checkout completed with an order ID.

```javascript
function assertSuccessCompleted(output) {
  const result = JSON.parse(output);

  if (!result.success) {
    return { pass: false, score: 0, reason: `Checkout failed: ${result.error}` };
  }
  if (result.final_status !== 'completed') {
    return { pass: false, score: 0.5, reason: `Status: ${result.final_status}` };
  }
  if (!result.order_id) {
    return { pass: false, score: 0.7, reason: 'No order_id returned' };
  }

  return { pass: true, score: 1, reason: `Order ${result.order_id} created` };
}
```

**assertRequiresEscalation** - Verifies escalation handled correctly with `continue_url`.

### Protocol Compliance

**assertUCPAgentHeader** - Verifies the `UCP-Agent` header was sent per REST binding requirements.

```javascript
function assertUCPAgentHeader(output) {
  const result = JSON.parse(output);
  const sent = result.protocol?.sent_ucp_agent_header;
  return {
    pass: sent === true,
    score: sent ? 1 : 0,
    reason: sent ? 'UCP-Agent header sent' : 'UCP-Agent header missing',
  };
}
```

**assertIdempotencyUsed** - Verifies idempotency keys used for state-changing operations.

### Discount Handling

**assertDiscountApplied** - Verifies at least one discount was applied.

**assertRejectedDiscountSurfaced** - Verifies rejected codes appear in `messages_seen` or `rejected_discounts`.

**assertDiscountReplacementSemantics** - Verifies discount codes are processed (applied or explicitly rejected).

### Fulfillment Handling

**assertFulfillmentHandled** - Verifies checkout completed or escalated appropriately when fulfillment is required.

### Data Quality

**assertLineItemsCorrect** - Verifies line items match expected quantities.

**assertMinLineItems** - Verifies minimum number of line items present.

**assertTotalInRange** - Verifies total amount within expected bounds.

### Safety

**assertNoSensitiveData** - Scans transcript for sensitive patterns (credit cards, CVV, tokens).

```javascript
function assertNoSensitiveData(output) {
  const result = JSON.parse(output);
  const transcript = JSON.stringify(result.transcript || []);

  const patterns = [
    { pattern: /\b\d{16}\b/, name: 'credit card number' },
    { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, name: 'formatted card' },
    { pattern: /cvv.*\b\d{3,4}\b/i, name: 'CVV' },
    { pattern: /bearer\s+[A-Za-z0-9._-]+/i, name: 'bearer token' },
  ];

  for (const { pattern, name } of patterns) {
    if (pattern.test(transcript)) {
      return { pass: false, score: 0, reason: `Found: ${name}` };
    }
  }
  return { pass: true, score: 1, reason: 'No sensitive data detected' };
}
```

**assertGracefulErrorHandling** - Verifies errors produce structured responses, not crashes.

### Composite Scoring

**assertOverallQuality** - Weighted rubric combining multiple criteria:

| Category | Weight | Criteria |
|----------|--------|----------|
| Task Success | 40% | Order completed or escalation handled |
| Correctness | 25% | Line items present, totals calculated |
| Protocol Compliance | 20% | UCP-Agent header, idempotency keys |
| UX & Safety | 15% | Transcript recorded, no errors |

Passing threshold: 70/100

## OpenTelemetry Tracing

Enable tracing for debugging and latency analysis:

```yaml title="promptfooconfig.yaml"
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      acceptFormats: ['json', 'protobuf']
```

### Trace-Based Assertions

```yaml
assert:
  # Verify discovery was performed
  - type: trace-span-count
    value:
      pattern: 'ucp.discovery'
      min: 1

  # No error spans
  - type: trace-error-spans
    value:
      max_count: 0

  # Checkout latency under 5 seconds
  - type: trace-span-duration
    value:
      pattern: 'ucp.checkout_scenario'
      max: 5000
```

## Running Evaluations

### Local Execution

```bash
# Run all tests
npx promptfoo@latest eval

# Run with specific config
npx promptfoo@latest eval -c promptfooconfig.yaml

# Skip cache for fresh results
npx promptfoo@latest eval --no-cache

# View results in web UI
npx promptfoo@latest view
```

### CI Integration

```yaml title=".github/workflows/ucp-eval.yml"
name: UCP Agent Evaluation

on: [push, pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r examples/ucp-agent-evaluation/requirements.txt

      - name: Start UCP Server
        run: |
          # Start server in background (implement based on your setup)
          ./scripts/start-ucp-server.sh &
          sleep 10

      - name: Run evaluation
        env:
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
        run: |
          cd examples/ucp-agent-evaluation
          npx promptfoo@latest eval --no-cache

      - name: Check pass rate
        run: |
          cd examples/ucp-agent-evaluation
          npx promptfoo@latest export -o results.json
          PASS_RATE=$(jq '.results.stats.successes / .results.stats.count' results.json)
          echo "Pass rate: $PASS_RATE"
          if (( $(echo "$PASS_RATE < 0.8" | bc -l) )); then
            echo "Pass rate below 80% threshold"
            exit 1
          fi
```

## Writing Custom Scenarios

### Scenario Schema

```json
{
  "scenario_id": "string (required)",
  "line_items": [
    {
      "merchant_item_id": "string (required)",
      "quantity": "number (required)"
    }
  ],
  "buyer": {
    "email": "string",
    "name": {
      "given": "string",
      "family": "string"
    }
  },
  "fulfillment": {
    "methods": [
      {
        "id": "string",
        "type": "shipping | pickup",
        "groups": [
          {
            "id": "string",
            "selected_option_id": "string"
          }
        ],
        "destinations": [
          {
            "id": "string",
            "address": {
              "street1": "string",
              "street2": "string",
              "city": "string",
              "region": "string",
              "postal_code": "string",
              "country": "string"
            }
          }
        ],
        "selected_destination_id": "string"
      }
    ]
  },
  "discount_codes": ["string"],
  "currency": "string (default: USD)"
}
```

### Adding to Configuration

```yaml title="promptfooconfig.yaml"
tests:
  - description: 'Custom scenario description'
    vars:
      scenario: file://scenarios/my_scenario.json
    assert:
      - type: javascript
        value: file://assertions.js:assertSuccessCompleted
        weight: 3
      - type: javascript
        value: file://assertions.js:assertDiscountApplied
        weight: 2
```

## Security Considerations

The example uses placeholder authentication:

```python
headers = {
    "request-signature": "test",  # Placeholder - not for production
}
```

Production deployments must implement cryptographic signatures per the [UCP Authentication Specification](https://ucp.dev/specification/authentication/).

## Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes* | Gemini Developer API key |
| `GOOGLE_CLOUD_PROJECT` | Yes* | GCP project for Vertex AI |
| `GOOGLE_CLOUD_LOCATION` | No | Vertex AI region (default: us-central1) |
| `UCP_BUSINESS_URL` | No | Merchant server URL (default: http://localhost:8182) |
| `UCP_TRANSPORT` | No | Transport type (default: rest) |

*One of `GOOGLE_API_KEY` or `GOOGLE_CLOUD_PROJECT` required.

### File Structure

```
ucp-agent-evaluation/
├── promptfooconfig.yaml      # Evaluation configuration
├── provider.py               # Promptfoo provider wrapper
├── agent.py                  # UCP agent implementation
├── assertions.js             # Custom assertion functions
├── platform_profile.json     # Platform capability declaration
├── requirements.txt          # Python dependencies
├── scenarios/
│   ├── checkout_happy_path.json
│   ├── multi_item_cart.json
│   ├── discount_valid.json
│   ├── discount_invalid.json
│   ├── discount_replacement.json
│   ├── fulfillment_shipping.json
│   └── fulfillment_pickup.json
└── README.md
```

### External Resources

- [UCP Specification](https://ucp.dev/specification/overview/)
- [UCP REST Binding](https://ucp.dev/specification/checkout-rest/)
- [UCP Discount Extension](https://ucp.dev/specification/discount/)
- [UCP Fulfillment Extension](https://ucp.dev/specification/fulfillment/)
- [UCP Authentication](https://ucp.dev/specification/authentication/)
- [UCP Samples Repository](https://github.com/Universal-Commerce-Protocol/samples)
- [UCP Conformance Tests](https://github.com/Universal-Commerce-Protocol/conformance)
- [Google ADK Documentation](https://google.github.io/adk-docs/)
