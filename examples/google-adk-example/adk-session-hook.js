/**
 * ADK Session Management Hook
 *
 * This extension automatically creates ADK sessions before running tests
 * and provides cleanup after all tests complete.
 */

const http = require('http');

// Simple HTTP request helper
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve(JSON.parse(body)),
        });
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function adkSessionHook(hookName, context) {
  const ADK_HOST = 'localhost';
  const ADK_PORT = 8000;
  const APP_NAME = 'weather_agent';
  const USER_ID = 'test_user';

  if (hookName === 'beforeAll') {
    // Collect all unique session IDs from tests
    const sessionIds = new Set();

    // Check if this is single-turn (multiple session IDs) or multi-turn (one session ID)
    context.suite.tests.forEach((test) => {
      if (test.vars && test.vars.session_id) {
        sessionIds.add(test.vars.session_id);
      }
    });

    // Default to shared session if no session_id variables found
    if (sessionIds.size === 0) {
      sessionIds.add('conversation');
    }

    console.log(`🔧 Setting up ${sessionIds.size} ADK session(s)...`);

    try {
      for (const sessionId of sessionIds) {
        const options = {
          hostname: ADK_HOST,
          port: ADK_PORT,
          path: `/apps/${APP_NAME}/users/${USER_ID}/sessions/${sessionId}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        };

        const response = await makeRequest(options, JSON.stringify({ state: {} }));

        if (response.ok) {
          const sessionData = await response.json();
          console.log(`✅ Session created: ${sessionData.id}`);
        } else if (response.status === 422) {
          console.log(`ℹ️  Session ${sessionId} already exists`);
        } else {
          console.warn(`⚠️  Failed to create session ${sessionId}: ${response.status}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Error connecting to ADK server: ${error.message}`);
      console.warn('Make sure ADK server is running on http://localhost:8000');
    }

    // Store session IDs for cleanup
    context._adkSessionIds = Array.from(sessionIds);
  } else if (hookName === 'afterAll') {
    console.log(`\n🧹 Cleaning up ADK sessions...`);

    const sessionIds = context._adkSessionIds || ['conversation'];

    try {
      for (const sessionId of sessionIds) {
        const options = {
          hostname: ADK_HOST,
          port: ADK_PORT,
          path: `/apps/${APP_NAME}/users/${USER_ID}/sessions/${sessionId}`,
          method: 'DELETE',
        };

        await makeRequest(options);
      }
      console.log('✅ All sessions cleaned up');
    } catch (error) {
      console.log(`ℹ️  Cleanup error (non-critical): ${error.message}`);
    }
  }
}

module.exports = adkSessionHook;
