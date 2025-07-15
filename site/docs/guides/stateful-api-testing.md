---
sidebar_label: Stateful API Testing
---

# Testing Stateful APIs and Managing Conversation History

This guide provides comprehensive patterns and best practices for testing stateful APIs that maintain conversation history or session state across multiple interactions.

## Understanding Stateful APIs

Stateful APIs maintain context between requests, typically through:
- Session identifiers (cookies, headers, or tokens)
- Server-side conversation history
- User-specific state management

## Stateful vs Stateless Modes

When testing conversational APIs with multi-turn strategies (GOAT, Crescendo, etc.), you need to choose the appropriate mode:

### Stateful Mode (Server Maintains History)

Use when your API maintains conversation history internally:

```yaml
strategies:
  - id: goat
    config:
      stateful: true   # Send only the latest message
      maxTurns: 5
```

In stateful mode:
- Only the latest user message is sent
- The API maintains the conversation context
- Session IDs are used to track conversations

### Stateless Mode (Client Maintains History)

Use when your API expects the full conversation history:

```yaml
strategies:
  - id: crescendo
    config:
      stateful: false  # Send entire conversation array (default)
      maxTurns: 10
```

In stateless mode:
- The entire conversation history is sent with each request
- The client manages the conversation context
- No session tracking is required

## Session Management Patterns

### Basic Session Extraction

Extract session IDs from API responses using `sessionParser`:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/chat'
      headers:
        'x-session-id': '{{sessionId}}'
      body:
        message: '{{prompt}}'
      sessionParser: 'data.headers["x-session-id"]'
```

### Common Session Parser Patterns

```yaml
# From response headers
sessionParser: 'data.headers["x-session-id"]'

# From cookies
sessionParser: 'data.headers["set-cookie"]'

# From response body
sessionParser: 'data.body.sessionId'
sessionParser: 'data.body.conversation.id'
sessionParser: 'data.body.data.session'

# With fallbacks
sessionParser: 'data.body?.session?.id || data.headers["session-id"]'

# Complex extraction
sessionParser: |
  data.headers["set-cookie"]?.match(/session=([^;]+)/)?.[1] || 
  data.body.sessionId
```

### Custom Session Parser Functions

For complex session logic, use file-based parsers:

```yaml
sessionParser: 'file://parsers/session.js'
```

```javascript
// parsers/session.js
module.exports = (data) => {
  // Extract session from cookie header
  const cookieHeader = data.headers['set-cookie'];
  if (cookieHeader) {
    // Handle multiple cookie formats
    const sessionMatch = cookieHeader.match(/session=([^;]+)/);
    const sidMatch = cookieHeader.match(/sid=([^;]+)/);
    
    if (sessionMatch) return sessionMatch[1];
    if (sidMatch) return sidMatch[1];
  }
  
  // Check various body locations
  const bodySession = 
    data.body?.sessionId ||
    data.body?.session_id ||
    data.body?.conversation?.id ||
    data.body?.data?.session;
    
  if (bodySession) return bodySession;
  
  // Check custom headers
  const customSession = 
    data.headers['x-session-id'] ||
    data.headers['x-conversation-id'];
    
  return customSession || null;
};
```

## Client-Side Session Management

Generate unique session IDs for each test case:

```yaml
defaultTest:
  options:
    transformVars: |
      {
        ...vars,
        sessionId: context.uuid,
        userId: 'test-user-' + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now()
      }

providers:
  - id: https
    config:
      url: 'https://api.example.com/chat'
      headers:
        'X-Session-ID': '{{sessionId}}'
        'X-User-ID': '{{userId}}'
      body:
        message: '{{prompt}}'
        sessionId: '{{sessionId}}'
```

## Handling Multi-Turn Conversations

### Complete Stateful Example

```yaml
# promptfooconfig.yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/chat'
      method: POST
      headers:
        'Content-Type': 'application/json'
        'Authorization': 'Bearer {{env.API_KEY}}'
        'X-Session-ID': '{{sessionId}}'
      body:
        message: '{{prompt}}'
        context: {
          user_id: '{{userId}}',
          session_id: '{{sessionId}}',
          metadata: {
            test_run: '{{testRunId}}',
            timestamp: '{{timestamp}}'
          }
        }
      sessionParser: |
        data.body.session_id || data.headers['x-session-id']
      transformResponse: |
        {
          output: json.data.response,
          tokenUsage: {
            prompt: json.usage.input_tokens,
            completion: json.usage.output_tokens,
            total: json.usage.total_tokens
          }
        }

defaultTest:
  options:
    transformVars: |
      {
        ...vars,
        userId: 'test-user-' + Math.random().toString(36).substr(2, 9),
        sessionId: context.uuid,
        testRunId: Date.now().toString(),
        timestamp: new Date().toISOString()
      }

redteam:
  strategies:
    - goat:
        stateful: true
        maxTurns: 5
    - crescendo:
        stateful: true
        maxTurns: 10
        maxBacktracks: 5
    - mischievous-user:
        stateful: true
        maxTurns: 3
```

### Handling Complex Message Formats

Some APIs require specific message formats:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/chat'
      transformRequest: 'file://transforms/request.js'
      transformResponse: 'file://transforms/response.js'
```

```javascript
// transforms/request.js
module.exports = (prompt) => {
  // Handle multi-turn message arrays
  try {
    const messages = JSON.parse(prompt);
    if (Array.isArray(messages)) {
      return {
        conversation: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || Date.now()
        })),
        system_prompt: "You are a helpful assistant",
        model_config: {
          temperature: 0.7,
          max_tokens: 1000
        }
      };
    }
  } catch {
    // Single message
    return {
      message: prompt,
      new_conversation: true,
      system_prompt: "You are a helpful assistant"
    };
  }
};
```

```javascript
// transforms/response.js
module.exports = (json, text, context) => {
  // Extract response and maintain session
  if (!json.success) {
    throw new Error(`API error: ${json.error || 'Unknown error'}`);
  }
  
  const response = {
    output: json.data.message || json.data.response,
    metadata: {
      conversationId: json.data.conversation_id,
      messageId: json.data.message_id,
      timestamp: json.data.timestamp
    }
  };
  
  // Include token usage if available
  if (json.usage) {
    response.tokenUsage = {
      prompt: json.usage.prompt_tokens,
      completion: json.usage.completion_tokens,
      total: json.usage.total_tokens
    };
  }
  
  return response;
};
```

## Advanced Patterns

### Session Pooling for High-Volume Testing

When running many tests, implement session pooling:

```javascript
// session-pool.js
class SessionPool {
  constructor(maxSessions = 10) {
    this.sessions = [];
    this.maxSessions = maxSessions;
    this.inUse = new Set();
  }
  
  async getSession() {
    // Find available session
    const available = this.sessions.find(s => !this.inUse.has(s.id));
    if (available) {
      this.inUse.add(available.id);
      return available;
    }
    
    // Create new session if under limit
    if (this.sessions.length < this.maxSessions) {
      const newSession = {
        id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        created: Date.now()
      };
      this.sessions.push(newSession);
      this.inUse.add(newSession.id);
      return newSession;
    }
    
    // Wait for available session
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.getSession();
  }
  
  releaseSession(sessionId) {
    this.inUse.delete(sessionId);
  }
}

module.exports = new SessionPool();
```

### Session Cleanup and Isolation

Implement cleanup for test isolation:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/chat'
      headers:
        'X-Test-Session': 'test-{{sessionId}}-{{timestamp}}'
      transformResponse: 'file://cleanup-transform.js'
```

```javascript
// cleanup-transform.js
const activeSessions = new Set();

module.exports = async (json, text, context) => {
  const sessionId = context.vars.sessionId;
  
  try {
    // Track active sessions
    if (sessionId && !activeSessions.has(sessionId)) {
      activeSessions.add(sessionId);
      
      // Schedule cleanup after test completion
      process.on('exit', async () => {
        if (activeSessions.has(sessionId)) {
          // Call cleanup endpoint
          await fetch('https://api.example.com/sessions/' + sessionId, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${process.env.API_KEY}`
            }
          }).catch(() => {}); // Ignore cleanup errors
        }
      });
    }
    
    return json.response;
  } catch (error) {
    console.error('Transform error:', error);
    throw error;
  }
};
```

### Debugging Multi-Turn Conversations

Enable detailed logging for troubleshooting:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/chat'
      transformRequest: |
        (prompt) => {
          console.log('=== Request Debug ===');
          console.log('Prompt type:', typeof prompt);
          console.log('Prompt content:', prompt);
          
          if (prompt.startsWith('[')) {
            const messages = JSON.parse(prompt);
            console.log('Turn count:', messages.length);
            console.log('Last message:', messages[messages.length - 1]);
          }
          
          return prompt;
        }
      transformResponse: |
        (json, text, context) => {
          console.log('=== Response Debug ===');
          console.log('Session ID:', context.vars.sessionId);
          console.log('Response status:', context.response?.status);
          console.log('Has output:', !!json.response);
          
          return json.response;
        }
```

## Best Practices

### 1. Choose the Right Mode

- Use `stateful: true` when:
  - Your API maintains conversation history server-side
  - You're using session-based authentication
  - The API has rate limits per session

- Use `stateful: false` when:
  - Your API is truly stateless
  - Each request must include full context
  - You're testing context window limits

### 2. Session Security

```yaml
# Use environment variables for sensitive data
providers:
  - id: https
    config:
      headers:
        'Authorization': 'Bearer {{env.API_KEY}}'
        'X-API-Secret': '{{env.API_SECRET}}'
      
# Never log sensitive session data
transformResponse: |
  (json, text, context) => {
    // Don't log auth tokens or session secrets
    const safeContext = { ...context };
    delete safeContext.vars.apiKey;
    delete safeContext.vars.sessionSecret;
    
    if (context.vars.debug) {
      console.log('Debug context:', safeContext);
    }
    
    return json.response;
  }
```

### 3. Error Handling

Implement comprehensive error handling:

```javascript
// error-handler.js
module.exports = (json, text, context) => {
  // Session expiration
  if (context.response?.status === 401) {
    if (text.includes('session expired')) {
      throw new Error('Session expired - please refresh session');
    }
    throw new Error('Authentication failed');
  }
  
  // Rate limiting
  if (context.response?.status === 429) {
    const retryAfter = context.response.headers['retry-after'];
    throw new Error(`Rate limited. Retry after ${retryAfter}s`);
  }
  
  // Invalid response format
  if (!json || typeof json !== 'object') {
    throw new Error(`Invalid response format: ${text}`);
  }
  
  // API errors
  if (json.error) {
    throw new Error(`API error: ${json.error.message || json.error}`);
  }
  
  // Missing expected fields
  if (!json.response && !json.data && !json.message) {
    console.warn('Unexpected response structure:', json);
    throw new Error('Response missing expected fields');
  }
  
  return json.response || json.data || json.message;
};
```

### 4. Testing Considerations

- **Isolation**: Use unique session IDs per test case
- **Cleanup**: Implement session cleanup to prevent pollution
- **Monitoring**: Track session creation and usage
- **Rate Limits**: Respect API rate limits with session pooling

### 5. Performance Optimization

```javascript
// Implement caching for session data
const sessionCache = new Map();

module.exports = (data) => {
  const cacheKey = `${data.headers['x-session-id']}-${Date.now()}`;
  
  // Check cache (with 5-minute TTL)
  const cached = sessionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 300000) {
    return cached.sessionId;
  }
  
  // Extract and cache
  const sessionId = data.body?.sessionId || data.headers['x-session-id'];
  if (sessionId) {
    sessionCache.set(cacheKey, {
      sessionId,
      timestamp: Date.now()
    });
  }
  
  // Clean old entries
  if (sessionCache.size > 100) {
    const oldestKey = sessionCache.keys().next().value;
    sessionCache.delete(oldestKey);
  }
  
  return sessionId;
};
```

## Troubleshooting

### Common Issues

1. **Session Not Persisting**
   - Verify `sessionParser` is extracting the correct value
   - Check if the API requires specific headers or cookies
   - Ensure session ID is being passed in subsequent requests

2. **Conversation History Lost**
   - Confirm you're using the correct stateful/stateless mode
   - Verify the API's expected message format
   - Check if sessions are expiring between turns

3. **Rate Limiting**
   - Implement exponential backoff
   - Use session pooling to distribute load
   - Add delays between requests if needed

4. **Authentication Errors**
   - Verify environment variables are set
   - Check if sessions require refresh
   - Ensure auth tokens are properly formatted

## See Also

- [HTTP Provider Documentation](/docs/providers/http)
- [Red Team Configuration](/docs/red-team)
- [Multi-turn Strategies](/docs/red-team/strategies)