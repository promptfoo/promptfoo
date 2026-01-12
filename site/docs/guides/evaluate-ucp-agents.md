---
title: Evaluating UCP Agents for Agentic Commerce
sidebar_label: UCP Agents
description: Test AI agents that use Universal Commerce Protocol (UCP) for checkout, discounts, and fulfillment flows.
---

# Evaluating UCP Agents for Agentic Commerce

[Universal Commerce Protocol (UCP)](https://ucp.dev/) is an open standard for agentic commerce. It defines how AI agents, platforms, and businesses can transact without custom integrations per merchant.

This guide shows how to evaluate UCP agents using promptfoo to test:

- Checkout flow completion
- Protocol compliance (headers, idempotency)
- Extension handling (discounts, fulfillment)
- Error recovery and user experience

## Quick Start

```bash
npx promptfoo@latest init --example ucp-agent-evaluation
```

## Prerequisites

1. **Python 3.10+** with dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. **Google API Key** (optional): Set `GOOGLE_API_KEY` for AI-powered agent. Falls back to deterministic execution without it.
3. **UCP Merchant Server** - See [server setup](#setting-up-the-ucp-merchant-server)

## Understanding UCP

UCP uses a discovery → negotiation → transact flow:

1. **Discovery**: Business publishes profile at `/.well-known/ucp`
2. **Negotiation**: Platform and business compute capability intersection
3. **Transact**: Execute operations via REST binding

<details>
<summary>Key UCP Concepts</summary>

| Term           | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| **Platform**   | Consumer-facing surface (AI agent, app) acting on behalf of the user |
| **Business**   | Seller and Merchant of Record (MoR)                                  |
| **Capability** | Core feature like `dev.ucp.shopping.checkout`                        |
| **Extension**  | Optional module that augments a capability (discounts, fulfillment)  |
| **Profile**    | JSON document declaring identity, endpoints, and capabilities        |

The checkout lifecycle follows these states:

- `incomplete` → Missing required info
- `requires_escalation` → Hand off to business UI
- `ready_for_complete` → Can finalize programmatically
- `completed` → Order placed successfully

See the [UCP Specification](https://ucp.dev/specification/overview/) for details.

</details>

## Setting Up the UCP Merchant Server

Clone and run the official UCP sample server:

```bash
# Clone repositories
git clone https://github.com/Universal-Commerce-Protocol/samples.git
git clone https://github.com/Universal-Commerce-Protocol/conformance.git

cd samples

# Install dependencies (requires uv package manager: https://docs.astral.sh/uv/)
uv sync --directory rest/python/server/

# Initialize test data
DATABASE_PATH=/tmp/ucp_test
mkdir -p ${DATABASE_PATH}

uv run --directory rest/python/server import_csv.py \
  --products_db_path=${DATABASE_PATH}/products.db \
  --transactions_db_path=${DATABASE_PATH}/transactions.db \
  --data_dir=../conformance/test_data/flower_shop

# Start server
uv run --directory rest/python/server server.py \
  --products_db_path=${DATABASE_PATH}/products.db \
  --transactions_db_path=${DATABASE_PATH}/transactions.db \
  --port=8182 \
  --simulation_secret=super-secret-sim-key
```

Verify: `curl http://localhost:8182/.well-known/ucp | jq .`

## Example Configuration

The example includes a Python provider that wraps an AI-powered UCP agent using [Google's Agent Development Kit (ADK)](https://github.com/google/adk-python) with Gemini:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{scenario}}'

providers:
  - id: file://provider.py
    label: UCP Agent (REST)
    config:
      transport: rest
      platform_profile_path: platform_profile.json

tests:
  - description: 'Happy path checkout'
    vars:
      scenario: file://scenarios/checkout_happy_path.json
    assert:
      - type: javascript
        value: file://assertions.js:assertSuccessCompleted
```

Scenarios are JSON files defining checkout inputs. See `scenarios/checkout_happy_path.json` for the complete file:

```json title="scenarios/checkout_happy_path.json"
{
  "scenario_id": "checkout_happy_path",
  "line_items": [{ "merchant_item_id": "bouquet_roses", "quantity": 2 }],
  "buyer": {
    "email": "jane.doe@example.com",
    "name": { "given": "Jane", "family": "Doe" }
  },
  "currency": "USD"
}
```

:::note
The example uses product IDs from the flower shop test data: `bouquet_roses`, `bouquet_tulips`, `pot_ceramic`, `orchid_white`, `gardenias`.
:::

## AI Agent Architecture

The agent uses Google ADK with Gemini 3 Flash to reason about UCP protocol:

```python
from google.adk.agents import Agent

agent = Agent(
    name="ucp_checkout_agent",
    model="gemini-3-flash-preview",
    tools=[
        discover_ucp_server,
        create_checkout,
        get_checkout_status,
        update_checkout_fulfillment,
        update_checkout_buyer,
        complete_checkout,
    ],
    instruction="""You are a UCP checkout agent. Execute the checkout flow:
    1. Discover server capabilities
    2. Create checkout with scenario items
    3. Resolve any issues (fulfillment, buyer info)
    4. Complete when ready_for_complete""",
)
```

If `GOOGLE_API_KEY` is not set, the agent falls back to deterministic execution for testing without API costs.

## Testing UCP Extensions

### Discounts

UCP's discount extension uses replacement semantics—new codes replace old ones. See `scenarios/discount_valid.json`:

```json
{
  "scenario_id": "discount_test",
  "line_items": [{ "merchant_item_id": "bouquet_roses", "quantity": 3 }],
  "discount_codes": ["10OFF"],
  "buyer": { "email": "test@example.com" }
}
```

Key assertions:

- `assertDiscountApplied` - Discount was applied and totals updated
- `assertRejectedDiscountSurfaced` - Invalid codes produce warning messages or are tracked as implicitly rejected

<details>
<summary>Discount Extension Details</summary>

Rejected codes may appear in `messages[]` with codes like:

- `discount_code_expired`
- `discount_code_invalid`
- `discount_code_combination_disallowed`

The agent also tracks implicit rejections—codes submitted but not applied—for servers that don't send explicit rejection messages.

See the [Discounts Extension Spec](https://ucp.dev/specification/discount/).

</details>

### Fulfillment

Test shipping and pickup flows. The UCP fulfillment format requires nested `methods[]`, `groups[]`, and `destinations[]`. See `scenarios/fulfillment_shipping.json`:

```json
{
  "scenario_id": "fulfillment_shipping",
  "line_items": [{ "merchant_item_id": "orchid_white", "quantity": 1 }],
  "buyer": { "email": "ship@example.com" },
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
  }
}
```

The agent must handle `fulfillment_option_required` messages by selecting from available shipping options.

## Protocol Compliance Assertions

The example includes assertions for UCP protocol requirements:

```javascript title="assertions.js"
// Check UCP-Agent header was sent (REST binding requirement)
function assertUCPAgentHeader(output) {
  const result = JSON.parse(output);
  return {
    pass: result.protocol?.sent_ucp_agent_header === true,
    score: result.protocol?.sent_ucp_agent_header ? 1 : 0,
    reason: 'UCP-Agent header check',
  };
}

// Check idempotency keys were used
function assertIdempotencyUsed(output) {
  const result = JSON.parse(output);
  return {
    pass: result.protocol?.used_idempotency_keys === true,
    score: result.protocol?.used_idempotency_keys ? 1 : 0,
    reason: 'Idempotency key check',
  };
}
```

<details>
<summary>Required Protocol Behaviors</summary>

**REST Binding:**

- `UCP-Agent` header with platform profile URI (RFC 8941 syntax)
- `Idempotency-Key` for state-changing operations
- HTTPS with TLS 1.3 (production)

:::warning Security Note
The example uses `request-signature: "test"` as a placeholder. For production AP2 (Agent-to-Platform) scenarios, this must be a real cryptographic signature per the [UCP Authentication Spec](https://ucp.dev/specification/authentication/).
:::

See the [REST Binding Spec](https://ucp.dev/specification/checkout-rest/).

</details>

## Quality Scoring Rubric

The example uses a weighted rubric for overall agent quality:

| Category            | Weight | Criteria                                  |
| ------------------- | ------ | ----------------------------------------- |
| Task Success        | 40%    | Order completed or escalation handled     |
| Correctness         | 25%    | Items, quantities, totals match expected  |
| Protocol Compliance | 20%    | UCP-Agent header, idempotency keys        |
| UX & Safety         | 15%    | No sensitive data leaked, errors surfaced |

```yaml
- description: 'Overall quality assessment'
  vars:
    scenario: file://scenarios/checkout_happy_path.json
  assert:
    - type: javascript
      value: file://assertions.js:assertOverallQuality
      weight: 5
```

## Result Artifact Schema

The agent returns structured JSON for assertions:

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

## OpenTelemetry Tracing

The example includes OpenTelemetry instrumentation for visibility into agent operations:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      acceptFormats: ['json', 'protobuf']
```

When tracing is enabled, you can:

- **View execution flow** in the Promptfoo web UI
- **Measure latency** of UCP operations (discovery, checkout, completion)
- **Debug failures** by inspecting span attributes

### Trace-Based Assertions

Use trace assertions to verify agent behavior:

```yaml
assert:
  # Ensure discovery was performed
  - type: trace-span-count
    value:
      pattern: 'ucp.discovery'
      min: 1

  # Ensure no errors in the trace
  - type: trace-error-spans
    value:
      max_count: 0

  # Monitor checkout latency
  - type: trace-span-duration
    value:
      pattern: 'ucp.checkout_scenario'
      max: 5000
```

See the [Tracing Documentation](/docs/tracing/) for more details.

## Common Evaluation Scenarios

| Scenario             | Tests                                       |
| -------------------- | ------------------------------------------- |
| Happy path           | Basic checkout completes                    |
| Valid discount       | Code applies, totals update                 |
| Invalid discount     | Rejection surfaced, checkout still succeeds |
| Fulfillment required | Address provided, option selected           |
| Escalation required  | Agent stops and returns `continue_url`      |
| Missing buyer info   | Agent supplies from scenario, recovers      |
| Multi-item cart      | Multiple line items handled correctly       |

## CI Integration

Add to your CI pipeline:

```yaml
- name: Start UCP Server
  run: |
    # Start server in background
    ./start_merchant_server.sh &
    sleep 5

- name: Run UCP Agent Eval
  env:
    GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
  run: npx promptfoo@latest eval --no-cache

- name: Check Results
  run: |
    npx promptfoo@latest export -o results.json
    # Fail if pass rate below 80%
    PASS_RATE=$(cat results.json | jq '.results.stats.successes / .results.stats.count')
    if (( $(echo "$PASS_RATE < 0.8" | bc -l) )); then
      echo "Pass rate $PASS_RATE is below threshold 0.8"
      exit 1
    fi
```

## Learn More

- [UCP Specification](https://ucp.dev/specification/overview/)
- [UCP Samples Repository](https://github.com/Universal-Commerce-Protocol/samples)
- [UCP Conformance Tests](https://github.com/Universal-Commerce-Protocol/conformance)
- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [Promptfoo Custom Providers](/docs/providers/custom-api/)
- [JavaScript Assertions](/docs/configuration/expected-outputs/javascript/)
- [OpenTelemetry Tracing](/docs/tracing/)
