# session-hooks-lifecycle (Session Management with Hooks)

This example demonstrates how to manage stateful sessions using promptfoo's `beforeAll` and `afterAll` extension hooks with custom providers. It shows an alternative pattern to provider-level session management where the session lifecycle is controlled through hooks rather than within the provider itself.

## Quick Start

```bash
npx promptfoo@latest init --example session-hooks-lifecycle
```

## What This Example Demonstrates

- **Session Lifecycle Management**: Create sessions before tests run and clean them up afterward
- **Shared State Pattern**: Share session information between hooks and custom providers
- **Mock Service Implementation**: Simulate a stateful service that requires session management
- **Cross-Language Support**: Both JavaScript and Python implementations following the same pattern
- **Error Handling**: Graceful handling of session creation and cleanup failures

## When to Use This Pattern

### Use Session Hooks When:

- **Shared Sessions**: Multiple providers need to share the same session
- **Centralized Management**: Session lifecycle should be independent of provider logic
- **Test Suite Scope**: Session should span the entire test suite, not individual tests
- **External Dependencies**: Managing external services like database connections or API clients
- **Complex Setup**: Session creation involves multiple steps or dependencies

### Use Provider-Level Sessions When:

- **Provider-Specific**: Each provider needs its own isolated session
- **Tight Coupling**: Session logic is inherently part of the provider's functionality
- **Per-Request Scope**: New sessions needed for each request or test
- **Native Patterns**: Following a provider's built-in session management

## Architecture

The example follows a clean separation of concerns:

```
┌─────────────────┐
│   beforeAll     │ ─── Creates Session ──→ ┌──────────────┐
│      Hook       │                          │   Shared     │
└─────────────────┘                          │    State     │
                                            │ (sessionId)  │
┌─────────────────┐                          └──────────────┘
│ Custom Provider │ ←── Reads Session ────────┘      │
│                 │                                   │
│                 │ ─── Makes Requests ──→ ┌─────────▼────┐
└─────────────────┘                        │   Session    │
                                           │   Service    │
┌─────────────────┐                        └─────────▲────┘
│    afterAll     │ ←── Closes Session ──────────────┘
│      Hook       │
└─────────────────┘
```

## How It Works

### 1. Session Service Initialization

The `beforeAll` hook runs before any tests:
- Initializes the mock session service
- Creates a new session for the test user
- Stores the session ID in shared state

### 2. Provider Uses Session

Each test runs with the custom provider:
- Provider checks for active session in shared state
- Makes requests using the session context
- Session maintains conversation history

### 3. Session Cleanup

The `afterAll` hook runs after all tests:
- Retrieves session statistics
- Closes the active session
- Cleans up shared state

## Running the Examples

### JavaScript Version

```bash
cd examples/session-hooks-lifecycle
npm run local -- eval -c promptfooconfig.yaml
```

Expected output:
```
=== Session Lifecycle Hook: Setting up ===
SessionService initialized
Session created for user test-user-123: a1b2c3d4...
✓ Session created successfully: a1b2c3d4...
✓ User ID: test-user-123
===========================================

[Test execution...]

=== Session Lifecycle Hook: Cleaning up ===
✓ Session stats: {"active_sessions":1,"total_requests":3}
Closing session a1b2c3d4... for user test-user-123
  Total requests: 3
  Duration: 523ms
✓ Session closed: a1b2c3d4...
============================================
```

### Python Version

```bash
npm run local -- eval -c promptfooconfig-python.yaml
```

The Python version provides identical functionality with Python-idiomatic implementation.

### Setting a Custom User ID

```bash
TEST_USER_ID=production-user npm run local -- eval -c promptfooconfig.yaml
```

## Code Structure

### JavaScript Implementation

**sessionService.js**: Mock service simulating a stateful API
```javascript
class SessionService {
  createSession(userId) { /* Creates session */ }
  makeRequest(sessionId, prompt) { /* Processes requests */ }
  closeSession(sessionId) { /* Cleanup */ }
}
```

**sessionProvider.js**: Custom provider using shared state
```javascript
const sharedState = { sessionId: null };

class SessionProvider {
  async callApi(prompt, context) {
    if (!sharedState.sessionId) {
      throw new Error('No active session');
    }
    // Use session for request
  }
}
```

**sessionHooks.js**: Lifecycle management
```javascript
async function sessionHook(hookName, context) {
  if (hookName === 'beforeAll') {
    // Create session, store in sharedState
  } else if (hookName === 'afterAll') {
    // Clean up session
  }
}
```

### Python Implementation

The Python version follows the same pattern with Python-specific adaptations:
- Uses `asyncio` for async operations
- Type hints for better IDE support
- File-based persistence for cross-process communication
- Session data stored as JSON files in temp directory

**Important:** Since Python providers run in separate processes, the Python implementation uses:
- File-based session storage (`/tmp/promptfoo_sessions/`)
- Persistent session state file (`/tmp/promptfoo_session_state.json`)
- This ensures session data is accessible across process boundaries

## Extending This Example

### Real-World Use Cases

#### 1. Database Connection Pool

Replace the mock service with actual database connection:

```javascript
// sessionService.js
const { Pool } = require('pg');

class DatabaseSessionService {
  async createSession(userId) {
    this.pool = new Pool({ /* config */ });
    await this.pool.connect();
    return this.pool;
  }

  async closeSession() {
    await this.pool.end();
  }
}
```

#### 2. OAuth Session Management

Manage OAuth tokens across tests:

```javascript
class OAuthSessionService {
  async createSession(userId) {
    const token = await this.authenticate(userId);
    this.tokens.set(sessionId, token);
    return sessionId;
  }

  async makeRequest(sessionId, endpoint) {
    const token = this.tokens.get(sessionId);
    return fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }
}
```

#### 3. Browser Automation Session

Control a browser instance for testing:

```javascript
const puppeteer = require('puppeteer');

class BrowserSessionService {
  async createSession() {
    this.browser = await puppeteer.launch();
    this.page = await this.browser.newPage();
    return this.page;
  }

  async closeSession() {
    await this.browser.close();
  }
}
```

#### 4. WebSocket Connection

Maintain WebSocket connections:

```javascript
class WebSocketSessionService {
  createSession(url) {
    this.ws = new WebSocket(url);
    return new Promise(resolve => {
      this.ws.on('open', () => resolve(this.ws));
    });
  }

  closeSession() {
    this.ws.close();
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### "No active session found" Error

**Problem**: Provider can't find the session
```
Error: No active session found. Make sure beforeAll hook ran successfully.
```

**Solutions**:
1. Ensure extensions are configured in `promptfooconfig.yaml`
2. Check that the hook file exports the correct function
3. Verify shared state is properly imported in both files

#### Session Not Cleaned Up

**Problem**: Sessions remain open after tests

**Solutions**:
1. Check for errors in test execution that might skip `afterAll`
2. Add error handling in the cleanup hook
3. Consider using process exit handlers for critical cleanup

#### Python Import Errors

**Problem**: "ModuleNotFoundError: No module named 'session_service'"

**Solutions**:
1. Ensure all Python files are in the same directory
2. Check that file names match import statements
3. Verify Python path includes the current directory

#### Session State Not Persisting

**Problem**: Each test seems to get a new session

**Solutions**:
1. Verify you're using `beforeAll` not `beforeEach`
2. Check that shared state is properly exported/imported
3. Ensure provider reads from shared state, not creating new sessions

### Debug Tips

1. **Enable Verbose Logging**: Add console.log statements to track session flow
2. **Check Shared State**: Log `sharedState` at the start of each provider call
3. **Monitor Hook Execution**: Verify hooks run in expected order
4. **Test Isolation**: Run a single test to isolate issues

## Comparison with Provider-Level Sessions

### Session Hooks (This Example)

**Advantages:**
- Centralized session management
- Share sessions across multiple providers
- Clear separation of concerns
- Easier to test session logic independently

**Best For:**
- Multi-provider test suites
- Complex session setup/teardown
- Shared test fixtures
- External service management

### Provider-Level Sessions (PR #5866)

**Advantages:**
- Self-contained provider logic
- Each provider manages its own lifecycle
- No shared state complexity
- Provider-specific session configurations

**Best For:**
- Single provider scenarios
- Provider-specific session requirements
- Stateless test execution
- Following provider's native patterns

## Implementation Notes

### Shared State Pattern

The example uses a module-level shared object pattern:

**JavaScript**: Exported object from provider module
```javascript
// Provider module exports shared state
module.exports.sharedState = sharedState;

// Hooks import and modify
const { sharedState } = require('./sessionProvider');
```

**Python**: Module-level global with accessor functions
```python
# Global state in provider module
_shared_state = {"session_id": None}

def get_shared_state():
    return _shared_state
```

### Error Handling Strategy

- **Setup Failures**: Log errors but don't throw (lets tests fail with clear messages)
- **Runtime Errors**: Return error in provider response format
- **Cleanup Failures**: Log warnings but don't block test completion

### Concurrency Limitations

This pattern creates one session per test suite run. It's suitable for:
- Sequential test execution
- Concurrent tests within a suite (sharing the session)

Not suitable for:
- Parallel test suite execution (would need unique session IDs)
- Per-test isolation requirements

## Advanced Patterns

### Multiple Sessions

For providers needing different sessions:

```javascript
const sharedState = {
  dbSession: null,
  apiSession: null,
  cacheSession: null
};

// Create multiple sessions in beforeAll
// Each provider uses its specific session
```

### Session Pooling

For better resource utilization:

```javascript
class SessionPool {
  constructor(maxSessions = 5) {
    this.available = [];
    this.inUse = new Map();
  }

  acquire(userId) {
    // Get session from pool or create new
  }

  release(sessionId) {
    // Return session to pool
  }
}
```

### Hierarchical Sessions

For nested test scenarios:

```javascript
const sessionStack = [];

// beforeAll: Create parent session
// beforeEach: Create child session
// afterEach: Close child session
// afterAll: Close parent session
```

## Learn More

- [Extension Hooks Documentation](https://promptfoo.dev/docs/configuration/hooks)
- [Custom Providers Guide](https://promptfoo.dev/docs/providers/custom)
- [Testing Best Practices](https://promptfoo.dev/docs/guides/testing)

## Summary

This example demonstrates a powerful pattern for managing stateful sessions in promptfoo tests. By leveraging extension hooks and shared state, you can:

- Manage complex session lifecycles
- Share resources across multiple providers
- Implement proper setup and teardown
- Handle errors gracefully
- Support multiple implementation languages

Whether you're testing APIs, managing database connections, or controlling browser sessions, this pattern provides a clean and maintainable approach to session management in your LLM evaluation workflows.