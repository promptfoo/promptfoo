# google-adk-example

This example demonstrates how to test Google Agent Development Kit (ADK) agents using promptfoo. It shows both single-turn and multi-turn conversation patterns with automatic session management.

You can run this example with:

```bash
npx promptfoo@latest init --example google-adk-example
```

## What this example shows

- **Real Gemini Integration**: Uses Gemini 2.5 Flash for actual AI responses
- **Function Tool Usage**: Weather agent with `get_weather` tool
- **Single-turn Testing**: Independent queries with isolated sessions
- **Multi-turn Testing**: Conversational memory across multiple queries
- **Automatic Session Management**: Setup and cleanup handled by promptfoo hooks

## Prerequisites

1. **Python 3.8+** installed on your system
2. **Google API Key** for Gemini model access (both agent and LLM grading)
3. **ADK Python package** installed

## Setup Instructions

### 1. Install the Google Agent Development Kit

```bash
pip install google-adk
```

### 2. Set up API Authentication

Get a Google API key from the [Google AI Studio](https://ai.google.dev/) and set it as an environment variable:

```bash
export GOOGLE_API_KEY="your-google-api-key-here"
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

Note: The session management is now handled entirely in JavaScript using Node.js native fetch, eliminating the need for additional Python HTTP libraries.

## Running the Examples

### 1. Start the ADK API Server

From this directory, run:

```bash
export GOOGLE_API_KEY="your-api-key-here"
adk api_server
```

You should see output like:

```text
INFO:     Started server process [12345]
INFO:     Application startup complete.
INFO:     Uvicorn running on http://localhost:8000
```

Keep this server running in one terminal.

### 2. Run Tests

In a new terminal, choose either:

**Single-turn testing** (isolated sessions):

```bash
promptfoo eval -c promptfooconfig-single-turn.yaml
```

**Multi-turn testing** (shared conversation):

```bash
promptfoo eval -c promptfooconfig-multi-turn.yaml --max-concurrency 1
```

Both configurations will:

- Automatically create and manage ADK sessions
- Test the weather agent with real Gemini calls
- Clean up sessions after completion

## Example Output

**Single-turn** - Each test uses a separate session:

```text
✅ Weather query for New York
✅ Weather query for London (independent session)
✅ Context isolation test: "I don't have memory of previous conversations"

Pass Rate: 100% (demonstrates session isolation)
```

**Multi-turn** - All tests share one session:

```text
✅ Initial weather query
✅ Follow-up weather query
✅ Memory test: "Comparing New York (sunny, 72°F) vs London (cloudy, 58°F)"

Pass Rate: 100% (demonstrates conversation memory)
```

## Understanding the Configuration

This example follows the official ADK pattern:

### Agent Structure (`weather_agent/agent.py`)

```python
from google.adk.agents import Agent

def get_weather(city: str) -> dict:
    # Mock weather function - replace with real API in production
    return {"status": "success", "report": "..."}

root_agent = Agent(
    name="weather_agent",
    model="gemini-2.5-flash",  # Real Gemini 2.5 Flash model
    description="Agent to answer questions about weather in various cities",
    instruction="You are a helpful weather assistant...",
    tools=[get_weather]
)
```

### Key Integration Files

1. **`adk-session-hook.js`**: Session management using Node.js native fetch
2. **`adk-response-transform.js`**: Extracts text responses from ADK's event-based format
3. **`weather_agent/`**: The actual ADK agent code (Python)

## Understanding ADK Sessions

ADK sessions are **stateful conversation contexts** that maintain memory between interactions. This is crucial for building conversational agents.

### Session Structure

Sessions follow this hierarchy:

```text
/apps/{app_name}/users/{user_id}/sessions/{session_id}
```

- **`app_name`**: Your agent (e.g., `weather_agent`)
- **`user_id`**: User identifier (e.g., `test_user`)
- **`session_id`**: Conversation thread (e.g., `session_shared`)

### Session Strategies

**Multi-turn (Shared Session)**:

```yaml
# promptfooconfig-multi-turn.yaml
body:
  session_id: 'conversation' # Same for all tests
```

**Benefits**: Agent remembers context across tests
**Use case**: Testing conversational flow and memory

**Single-turn (Separate Sessions)**:

```yaml
# promptfooconfig-single-turn.yaml
vars:
  session_id: 'session_ny' # Different per test
body:
  session_id: '{{session_id}}'
```

**Benefits**: Complete isolation, no test interference
**Use case**: Independent validation scenarios

### Session Management

Our example uses automatic session management:

1. **Creation**: `beforeAll` hook creates session before tests
2. **Usage**: All tests reference the same session
3. **Cleanup**: `afterAll` hook removes session after tests

To change session strategy, modify the session hook or use test-specific session IDs.

## Troubleshooting

### Common Issues

1. **Authentication errors**:

   ```bash
   export GOOGLE_API_KEY="your-key-from-ai-google-dev"
   ```

2. **500 Internal Server Error**:
   - Verify your Google API key is valid
   - Check that the ADK server is running
   - Ensure all Python dependencies are installed

3. **"Agent not found" error**: Make sure the ADK server can find the `weather_agent` directory

## Learn More

- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [Official ADK Samples](https://github.com/google/adk-samples)
- [Google AI Studio](https://ai.google.dev/) (get API keys)
- [promptfoo HTTP Provider](https://promptfoo.dev/docs/providers/http)
