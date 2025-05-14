# openai-agents (Airline Customer Service)

This example demonstrates how to integrate the OpenAI Agents SDK with promptfoo to build and evaluate a multi-agent customer service system.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-agents
```

## Overview

This example showcases an airline customer service system with multiple specialized agents:

1. **Triage Agent** - Routes customer inquiries to specialized agents
2. **FAQ Agent** - Answers policy questions (baggage, food, wifi, etc.)
3. **Seat Booking Agent** - Handles seat change requests

Key features:

- Agent handoffs between specialized services
- Context persistence across conversations
- Custom tools for policy lookups and seat updates
- Token usage tracking from the Agents SDK

## Requirements

- Python 3.8+
- OpenAI API key (set as `OPENAI_API_KEY`)

```bash
# Install dependencies
pip install -r requirements.txt
```

## Running the Example

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your_api_key_here

# Run the evaluation
npx promptfoo eval -c promptfooconfig.yaml

# View results
npx promptfoo view
```

## Test Scenarios

The example evaluates how agents handle different customer inquiries:

- Baggage policy questions
- Seat change requests
- Food service inquiries

Each scenario tests appropriate agent selection, handoffs, and response quality.

## Implementation Details

- `agent_provider.py` - Implements the airline agents with handoff functionality
- `promptfooconfig.yaml` - Test configuration for different query types
- `requirements.txt` - Python dependencies

The implementation demonstrates how to build complex agent systems with the OpenAI Agents SDK while leveraging promptfoo for evaluation.
