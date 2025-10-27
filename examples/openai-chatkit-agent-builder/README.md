# openai-chatkit-agent-builder (Test Agent Builder Workflows via ChatKit)

This example demonstrates how to test OpenAI Agent Builder workflows using ChatKit and promptfoo by creating a ChatKit backend wrapper around the Agents SDK.

## What This Example Shows

- **Agent Builder Integration**: Export workflows from Agent Builder and test them programmatically
- **ChatKit Backend**: Custom Python backend that wraps Agents SDK with ChatKit protocol
- **End-to-End Testing**: Test Agent Builder workflows with promptfoo's evaluation framework
- **SSE Streaming**: Real-time streaming responses via Server-Sent Events
- **Multi-turn Conversations**: Support for conversation history and context

## Prerequisites

- Node.js 20+ (use `nvm use` to align with `.nvmrc`)
- Python 3.11+
- OpenAI API key
- An Agent Builder workflow (or use the example agent provided)

## Environment Variables

This example requires:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set it in a `.env` file or directly in your environment:

```bash
export OPENAI_API_KEY=sk-...
```

## Installation

You can run this example with:

```bash
npx promptfoo@latest init --example openai-chatkit-agent-builder
```

Or if you've cloned the repo:

```bash
cd examples/openai-chatkit-agent-builder

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r backend/requirements.txt
```

## Running the Example

### Step 1: Start the ChatKit Backend

In one terminal:

```bash
cd backend
python server.py
```

The server will start on `http://localhost:8000`.

### Step 2: Run Promptfoo Tests

In another terminal:

```bash
npx promptfoo eval
```

This runs test cases against your Agent Builder workflow.

### Step 3: View Results

```bash
npx promptfoo view
```

Opens the evaluation results in a web interface showing how the agent handled different scenarios.

## Project Structure

```
openai-chatkit-agent-builder/
├── backend/
│   ├── server.py              # FastAPI server
│   ├── agent_wrapper.py       # ChatKit backend wrapper
│   └── requirements.txt       # Python dependencies
├── agents/
│   └── support-agent.py       # Example agent (exported from Agent Builder)
├── promptfooconfig.yaml       # Test scenarios
├── package.json
├── .env.example
└── README.md
```

## How It Works

### 1. Export Agent from Agent Builder

In OpenAI Agent Builder:
1. Click the "Code" button at the top
2. Select "Agents SDK" tab
3. Choose Python or TypeScript
4. Copy the exported code
5. Save to `agents/your-agent.py` or `agents/your-agent.ts`

### 2. ChatKit Backend Wrapper (`backend/agent_wrapper.py`)

The wrapper integrates Agents SDK with ChatKit protocol:

```python
from agents import Agent, Runner
from chatkit import ChatKitServer
from chatkit.agents import stream_agent_response, AgentContext

class AgentBuilderBackend(ChatKitServer):
    """Wraps an Agents SDK agent with ChatKit protocol"""

    def __init__(self, agent: Agent):
        super().__init__(store=InMemoryStore())
        self.agent = agent

    async def respond(self, thread, input_message, context):
        # Get user input
        user_input = input_message.content[0].text if input_message else ""

        # Run the Agents SDK agent
        result = Runner.run_streamed(self.agent, user_input)

        # Convert to ChatKit events
        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context
        )

        # Stream ChatKit-formatted events
        async for event in stream_agent_response(agent_context, result):
            yield event
```

**Key Points:**
- Takes an Agents SDK `Agent` as input
- Implements ChatKit `respond()` method
- Converts Agents SDK streaming output to ChatKit SSE events
- Handles conversation threading automatically

### 3. FastAPI Server (`backend/server.py`)

Serves the ChatKit backend over HTTP:

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from agent_wrapper import AgentBuilderBackend
from agents.support_agent import agent

app = FastAPI()
backend = AgentBuilderBackend(agent)

@app.post("/chatkit")
async def chatkit_endpoint(request: Request):
    result = await backend.process(await request.body(), {})
    return StreamingResponse(result, media_type="text/event-stream")
```

### 4. Promptfoo Configuration (`promptfooconfig.yaml`)

Test the agent through ChatKit protocol:

```yaml
description: Test Agent Builder workflow via ChatKit

providers:
  - openai:chatkit:support-agent
    config:
      backendUrl: 'http://localhost:8000/chatkit'

tests:
  - vars:
      query: "I need help with my order #12345"
    assert:
      - type: contains
        value: "order"
      - type: llm-rubric
        value: Response acknowledges order number and offers assistance
```

## Using Your Own Agent Builder Workflow

### Python Export

1. Export from Agent Builder as Python
2. Save to `agents/my-agent.py`:

```python
from agents import Agent, tool
from pydantic import Field

# Your exported agent definition
agent = Agent(
    name="My Agent",
    model="gpt-5-mini",
    instructions="Your agent instructions...",
    tools=[...],  # Your tools
)
```

3. Update `backend/server.py` to import your agent:

```python
from agents.my_agent import agent
```

### TypeScript Export

1. Export from Agent Builder as TypeScript
2. Save to `agents/my-agent.ts`
3. Modify `backend/server.py` to load TypeScript (requires Node.js bridge)

**Note:** Python export is recommended for simpler setup.

## Test Scenarios

The example includes various test cases:

### Basic Query
```yaml
- vars:
    query: "What's my order status?"
  assert:
    - type: contains
      value: "order"
```

### Tool Usage Verification
```yaml
- vars:
    query: "Look up order #12345"
  assert:
    - type: llm-rubric
      value: Agent used order lookup tool and returned specific information
```

### Multi-turn Conversation
```yaml
- vars:
    conversation:
      - role: user
        content: "I need a refund"
      - role: assistant
        content: "I can help with that. Can you provide your order number?"
      - role: user
        content: "Order #12345"
  assert:
    - type: llm-rubric
      value: Agent processes refund with context from earlier messages
```

## Customizing the Example

### Add More Tools

Extend your agent with additional tools:

```python
@tool
def check_inventory(product_id: str = Field(description="Product ID")):
    """Check product inventory"""
    # Your implementation
    return {"in_stock": True, "quantity": 42}

agent = Agent(
    name="Support Agent",
    tools=[check_inventory, ...],
)
```

### Modify Agent Instructions

Update the agent's behavior:

```python
agent = Agent(
    name="Support Agent",
    instructions="""You are a helpful customer support agent.

    Key behaviors:
    - Always be polite and professional
    - Use tools to look up real information
    - Escalate complex issues to human agents
    - Follow company policies strictly
    """,
    model="gpt-5",
)
```

### Add Test Assertions

Create comprehensive test coverage:

```yaml
tests:
  - description: Handles refund requests
    vars:
      query: "I want a refund for order #12345"
    assert:
      - type: llm-rubric
        value: Agent asks for refund reason
      - type: not-contains
        value: "error"
      - type: javascript
        value: output.length > 50  # Ensures detailed response

  - description: Escalates complex issues
    vars:
      query: "Your website charged me three times!"
    assert:
      - type: llm-rubric
        value: Agent acknowledges issue and offers to escalate to manager
```

## Debugging

### Enable Verbose Logging

Add to `backend/server.py`:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Test Backend Directly

```bash
curl -X POST http://localhost:8000/chatkit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "threads.create",
    "params": {
      "input": {
        "content": [{"type": "input_text", "text": "Hello!"}],
        "attachments": [],
        "quoted_text": null,
        "inference_options": {}
      }
    }
  }'
```

### Check Agent Output

The backend logs show:
- Incoming ChatKit requests
- Agents SDK execution
- Streaming events
- Errors and exceptions

## Architecture Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Promptfoo  │────────▶│    ChatKit   │────────▶│  Agents SDK │
│   Client    │  HTTP   │   Backend    │  Python │    Agent    │
│             │◀────────│   (FastAPI)  │◀────────│  (Exported) │
└─────────────┘   SSE   └──────────────┘  Events └─────────────┘
                            ▲
                            │
                     agent_wrapper.py
                   (Protocol Translation)
```

**Flow:**
1. Promptfoo sends ChatKit protocol request (HTTP POST)
2. FastAPI receives and routes to ChatKit backend
3. `agent_wrapper.py` extracts user message
4. Runs Agents SDK agent with user input
5. Converts Agents SDK events to ChatKit SSE format
6. Streams back to promptfoo via Server-Sent Events
7. Promptfoo evaluates response against assertions

## Advantages of This Approach

### ✅ Benefits

- **Test Agent Builder Workflows**: Programmatically test workflows built in the UI
- **Full Agents SDK Support**: All Agents SDK features work (tools, handoffs, reasoning, etc.)
- **Real Streaming**: Actual SSE streaming just like production ChatKit
- **Conversation History**: Multi-turn conversations with full context
- **Easy Deployment**: FastAPI backend can deploy anywhere (AWS, GCP, Vercel, etc.)
- **Debuggable**: Standard Python debugging tools work

### 💡 Use Cases

- **CI/CD Testing**: Automated testing of Agent Builder workflows in pipelines
- **Regression Testing**: Catch breaking changes when modifying agents
- **Quality Assurance**: Validate agent behavior before production deployment
- **A/B Testing**: Compare different agent configurations
- **Performance Testing**: Measure response times and token usage

## Limitations

- Requires running a separate Python backend server
- Agent Builder workflows must be exported to code (can't use workflow ID directly)
- Slightly more setup than using Agents SDK provider directly

## Alternative: Direct Agents SDK Testing

If you don't need ChatKit protocol, use the Agents SDK provider directly:

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent: file://./agents/my-agent.py
      maxTurns: 10
```

**When to use ChatKit approach:**
- You're building a ChatKit UI and want backend parity
- You need exact ChatKit protocol compatibility
- You're testing ChatKit-specific features (widgets, workflows, etc.)

**When to use Agents SDK approach:**
- Simpler setup (no backend server needed)
- Only testing agent logic, not ChatKit integration
- Faster iteration during development

## Troubleshooting

### Backend Won't Start

**Error: `ModuleNotFoundError: No module named 'chatkit'`**

```bash
pip install -r backend/requirements.txt
```

**Error: `Port 8000 already in use`**

Change the port in `server.py`:

```python
uvicorn.run(app, host="0.0.0.0", port=8001)
```

And update `promptfooconfig.yaml`:

```yaml
backendUrl: 'http://localhost:8001/chatkit'
```

### Connection Refused

Make sure the backend is running before running promptfoo tests.

### Tests Failing

1. Check backend logs for errors
2. Test backend directly with `curl` (see Debugging section)
3. Verify your `.env` file has `OPENAI_API_KEY` set
4. Ensure agent code has no syntax errors

## Next Steps

- Deploy the backend to a cloud provider (AWS Lambda, GCP Cloud Run, etc.)
- Add authentication and rate limiting
- Integrate with real databases for production data
- Add custom widgets using ChatKit widget system
- Implement handoffs to specialized sub-agents
- Connect to external APIs and tools

## Learn More

- [ChatKit Python SDK Documentation](https://openai.github.io/chatkit-python/)
- [OpenAI Agents SDK Documentation](https://github.com/openai/openai-agents-python)
- [Agent Builder Guide](https://platform.openai.com/docs/guides/agent-builder)
- [Promptfoo ChatKit Provider](/docs/providers/openai-chatkit)
- [Promptfoo Agents Provider](/docs/providers/openai-agents)
