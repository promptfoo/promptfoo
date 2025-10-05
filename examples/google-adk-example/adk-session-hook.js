/**
 * ADK Session Management Hook
 *
 * This extension automatically creates ADK sessions before running tests
 * and provides cleanup after all tests complete.
 */

async function makeRequest(method, url, data = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    };

    if (data && method === 'POST') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    return response;
  } catch (error) {
    throw new Error(`Request failed: ${error.message}`);
  }
}

async function adkSessionHook(hookName, context) {
  const ADK_HOST = process.env.ADK_HOST || 'localhost';
  const ADK_PORT = parseInt(process.env.ADK_PORT || '8000');
  const APP_NAME = process.env.ADK_APP_NAME || 'weather_agent';
  const USER_ID = process.env.ADK_USER_ID || 'test_user';

  const baseUrl = `http://${ADK_HOST}:${ADK_PORT}`;

  if (hookName === 'beforeAll') {
    // Collect all unique session IDs from tests
    const sessionIds = new Set();

    // Check if this is single-turn (multiple session IDs) or multi-turn (one session ID)
    const tests = context.suite?.tests || [];
    if (Array.isArray(tests)) {
      for (const test of tests) {
        if (test && typeof test === 'object' && test.vars && test.vars.session_id) {
          sessionIds.add(test.vars.session_id);
        }
      }
    }

    // Default to shared session if no session_id variables found
    if (sessionIds.size === 0) {
      sessionIds.add('conversation');
    }

    console.log(`🔧 Setting up ${sessionIds.size} ADK session(s)...`);

    try {
      for (const sessionId of sessionIds) {
        const url = `${baseUrl}/apps/${APP_NAME}/users/${USER_ID}/sessions/${sessionId}`;

        const response = await makeRequest('POST', url, { state: {} });

        if (response.ok) {
          const sessionData = await response.json();
          console.log(`✅ Session created: ${sessionData.id}`);
        } else if (response.status === 422) {
          console.log(`ℹ️  Session ${sessionId} already exists`);
        } else {
          console.log(`⚠️  Failed to create session ${sessionId}: ${response.status}`);
        }
      }
    } catch (error) {
      console.log(`⚠️  Error connecting to ADK server: ${error.message}`);
      console.log('Make sure ADK server is running on http://localhost:8000');
    }

    // Store session IDs for cleanup
    context._adkSessionIds = Array.from(sessionIds);
  } else if (hookName === 'afterAll') {
    console.log('\n🧹 Cleaning up ADK sessions...');

    const sessionIds = context._adkSessionIds || ['conversation'];

    try {
      for (const sessionId of sessionIds) {
        const url = `${baseUrl}/apps/${APP_NAME}/users/${USER_ID}/sessions/${sessionId}`;
        await makeRequest('DELETE', url);
      }
      console.log('✅ All sessions cleaned up');
    } catch (error) {
      console.log(`ℹ️  Cleanup error (non-critical): ${error.message}`);
    }
  }
}

module.exports = adkSessionHook;
