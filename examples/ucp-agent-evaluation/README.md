# ucp-agent-evaluation

Evaluate AI agents that interact with the [Universal Commerce Protocol (UCP)](https://ucp.dev/) for agentic commerce.

This example demonstrates how to:

- Test UCP agent checkout flows using an AI-powered agent
- Evaluate protocol compliance (headers, idempotency)
- Validate discount and fulfillment extension handling
- Score agent quality using a weighted rubric

The agent uses [Google's Agent Development Kit (ADK)](https://google.github.io/adk-docs/) with Gemini 2.0 Flash to reason about UCP protocol interactions.

## Quick Start

```bash
npx promptfoo@latest init --example ucp-agent-evaluation
```

## Prerequisites

### 1. Python Environment

This example requires Python 3.10+ with dependencies:

```bash
pip install -r requirements.txt
```

### 2. Gemini Access (Required)

Choose one of these options:

**Option A: Gemini API Key** (easiest)

Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey):

```bash
export GOOGLE_API_KEY=AIza...  # Your API key
```

**Option B: Vertex AI** (enterprise)

Use Google Cloud credentials with Vertex AI:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=us-central1  # or your preferred region
```

### 3. UCP Merchant Server

You need a running UCP merchant server. The recommended approach is to use the official UCP samples:

```bash
# Clone the UCP samples repository
git clone https://github.com/Universal-Commerce-Protocol/samples.git
cd samples

# Clone the conformance repo for test data
git clone https://github.com/Universal-Commerce-Protocol/conformance.git

# Install dependencies (using uv)
uv sync --directory rest/python/server/

# Initialize database with flower shop test data
DATABASE_PATH=/tmp/ucp_test
rm -rf ${DATABASE_PATH}
mkdir ${DATABASE_PATH}

uv run --directory rest/python/server import_csv.py \
  --products_db_path=${DATABASE_PATH}/products.db \
  --transactions_db_path=${DATABASE_PATH}/transactions.db \
  --data_dir=../conformance/test_data/flower_shop

# Start the merchant server
uv run --directory rest/python/server server.py \
  --products_db_path=${DATABASE_PATH}/products.db \
  --transactions_db_path=${DATABASE_PATH}/transactions.db \
  --port=8182 \
  --simulation_secret=super-secret-sim-key
```

Verify the server is running:

```bash
curl http://localhost:8182/.well-known/ucp | jq .
```

## Running the Evaluation

With the merchant server running:

```bash
# Run all tests
npx promptfoo@latest eval

# View results in the web UI
npx promptfoo@latest view
```

### Configuration Options

Set environment variables to customize:

```bash
# Custom server URL
UCP_BUSINESS_URL=http://localhost:9000 npx promptfoo@latest eval
```

## Project Structure

```
ucp-agent-evaluation/
├── promptfooconfig.yaml     # Main evaluation config
├── provider.py              # Promptfoo provider wrapper
├── agent.py                 # UCP agent (ADK + Gemini)
├── assertions.js            # Custom assertion functions
├── platform_profile.json    # Platform capability profile
├── requirements.txt         # Python dependencies
├── scenarios/               # Test scenario definitions
│   ├── checkout_happy_path.json
│   ├── discount_valid.json
│   ├── discount_invalid.json
│   ├── fulfillment_shipping.json
│   ├── fulfillment_pickup.json
│   └── ...
└── README.md
```

## Test Suites

### Suite A: Protocol Basics

- Happy path checkout
- Multi-item cart handling

### Suite B: Discount Extension

- Valid discount code application
- Invalid/expired code rejection (surfaced to user)
- Code replacement semantics

### Suite C: Fulfillment Extension

- Shipping address and option selection
- In-store pickup flow

### Suite D: Error Handling

- Missing buyer info recovery
- Empty cart handling

### Suite E: Quality Scoring

Weighted rubric evaluation:

| Category            | Weight | Criteria                                  |
| ------------------- | ------ | ----------------------------------------- |
| Task Success        | 40%    | Order completed or escalation handled     |
| Correctness         | 25%    | Items, quantities, totals match expected  |
| Protocol Compliance | 20%    | UCP-Agent header, idempotency keys        |
| UX & Safety         | 15%    | No sensitive data leaked, errors surfaced |

## Result Artifact Schema

The agent returns a structured JSON artifact for each scenario:

```json
{
  "scenario_id": "checkout_happy_path",
  "transport": "rest",
  "success": true,
  "final_status": "completed",
  "checkout_id": "chk_123",
  "order_id": "ord_456",
  "currency": "USD",
  "total_amount": 5400,
  "line_items": [
    {
      "merchant_item_id": "bouquet_roses",
      "title": "Red Rose Bouquet",
      "quantity": 2,
      "unit_price": 2500,
      "total": 5000
    }
  ],
  "applied_discounts": [{ "code": "10OFF", "amount": 1000 }],
  "rejected_discounts": [],
  "requires_escalation": false,
  "continue_url": null,
  "protocol": {
    "ucp_version": "2026-01-11",
    "sent_ucp_agent_header": true,
    "used_idempotency_keys": true
  },
  "metrics": {
    "http_requests": 7,
    "wall_time_ms": 4120
  },
  "transcript": [
    { "role": "tool", "content": "Discovered server with 3 capabilities" },
    { "role": "tool", "content": "Created checkout chk_123 with status: incomplete" }
  ],
  "messages_seen": [],
  "error": null
}
```

## Custom Scenarios

Add new scenarios in `scenarios/`. The flower shop test data includes these product IDs: `bouquet_roses`, `bouquet_tulips`, `pot_ceramic`, `orchid_white`, `gardenias`.

```json
{
  "scenario_id": "my_custom_test",
  "line_items": [{ "merchant_item_id": "bouquet_roses", "quantity": 2 }],
  "buyer": {
    "email": "test@example.com",
    "name": { "given": "Test", "family": "User" }
  },
  "discount_codes": ["10OFF"],
  "fulfillment": {
    "methods": [
      {
        "id": "ship_method",
        "type": "shipping",
        "groups": [{ "id": "ship_group", "selected_option_id": "std-ship" }],
        "destinations": [
          {
            "id": "ship_dest",
            "address": {
              "street1": "123 Main St",
              "city": "San Francisco",
              "region": "CA",
              "postal_code": "94102",
              "country": "US"
            }
          }
        ],
        "selected_destination_id": "ship_dest"
      }
    ]
  },
  "currency": "USD"
}
```

Then reference it in `promptfooconfig.yaml`:

```yaml
tests:
  - description: 'My custom scenario'
    vars:
      scenario: file://scenarios/my_custom_test.json
    assert:
      - type: javascript
        value: file://assertions.js:assertSuccessCompleted
```

## Agent Architecture

The agent uses Google's Agent Development Kit (ADK) with tools for each UCP operation:

- `discover_ucp_server` - Fetch and parse the UCP profile
- `create_checkout` - Initialize a checkout with line items
- `get_checkout_status` - Poll current checkout state
- `update_checkout_fulfillment` - Add shipping/pickup info
- `update_checkout_buyer` - Add buyer details
- `complete_checkout` - Finalize the order

The AI agent reasons about which tools to call and in what order based on the checkout state and any error messages returned.

### Security Note

The example uses `request-signature: "test"` as a placeholder header. For production AP2 (Agent-to-Platform) scenarios, this must be a real cryptographic signature per the [UCP Authentication Spec](https://ucp.dev/specification/authentication/).

## Troubleshooting

### Server Connection Errors

```
Error: Connection refused
```

Ensure the UCP merchant server is running on the expected port.

### Missing Capabilities

```
Error: Capability dev.ucp.shopping.discount not negotiated
```

The merchant server may not support the discount extension. Check `/.well-known/ucp` for available capabilities.

### Idempotency Conflicts

```
409 Conflict
```

The agent reuses idempotency keys correctly. If you see this, it may indicate duplicate test runs with cached keys.

## Learn More

- [UCP Specification](https://ucp.dev/specification/overview/)
- [UCP Samples Repository](https://github.com/Universal-Commerce-Protocol/samples)
- [UCP Conformance Tests](https://github.com/Universal-Commerce-Protocol/conformance)
- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [Promptfoo Custom Providers](https://promptfoo.dev/docs/providers/custom-api/)
- [Evaluating UCP Agents Guide](https://promptfoo.dev/docs/guides/evaluate-ucp-agents/)
