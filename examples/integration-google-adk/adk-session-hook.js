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

function getAdkConfig() {
  const host = process.env.ADK_HOST || 'localhost';
  const port = Number.parseInt(process.env.ADK_PORT || '8000', 10);
  const appName = process.env.ADK_APP_NAME || 'weather_agent';
  const userId = process.env.ADK_USER_ID || 'test_user';

  return {
    appName,
    userId,
    baseUrl: `http://${host}:${port}`,
  };
}

function getSessionUrl(config, sessionId) {
  return `${config.baseUrl}/apps/${config.appName}/users/${config.userId}/sessions/${sessionId}`;
}

function collectSessionIds(context) {
  const sessionIds = new Set();
  const tests = context.suite?.tests || [];

  if (Array.isArray(tests)) {
    for (const test of tests) {
      if (test && typeof test === 'object' && test.vars && test.vars.session_id) {
        sessionIds.add(test.vars.session_id);
      }
    }
  }

  if (sessionIds.size === 0) {
    sessionIds.add('conversation');
  }

  return Array.from(sessionIds);
}

async function createSession(config, sessionId) {
  const response = await makeRequest('POST', getSessionUrl(config, sessionId), { state: {} });

  if (response.ok) {
    const sessionData = await response.json();
    console.log(`✅ Session created: ${sessionData.id}`);
    return true;
  }

  if (response.status === 422) {
    console.log(`ℹ️  Session ${sessionId} already exists`);
    return true;
  }

  console.log(`⚠️  Failed to create session ${sessionId}: ${response.status}`);
  return false;
}

async function setupSessions(context, config) {
  const sessionIds = collectSessionIds(context);
  const createdSessionIds = [];
  console.log(`🔧 Setting up ${sessionIds.length} ADK session(s)...`);

  try {
    for (const sessionId of sessionIds) {
      if (await createSession(config, sessionId)) {
        createdSessionIds.push(sessionId);
      }
    }
  } catch (error) {
    console.log(`⚠️  Error connecting to ADK server: ${error.message}`);
    console.log('Make sure ADK server is running on http://localhost:8000');
  }

  context._adkSessionIds = createdSessionIds;
}

async function cleanupSessions(sessionIds, config) {
  console.log('\n🧹 Cleaning up ADK sessions...');

  try {
    for (const sessionId of sessionIds) {
      await makeRequest('DELETE', getSessionUrl(config, sessionId));
    }
    console.log('✅ All sessions cleaned up');
  } catch (error) {
    console.log(`ℹ️  Cleanup error (non-critical): ${error.message}`);
  }
}

async function adkSessionHook(hookName, context) {
  const config = getAdkConfig();

  if (hookName === 'beforeAll') {
    await setupSessions(context, config);
    return;
  }

  if (hookName === 'afterAll') {
    await cleanupSessions(context._adkSessionIds || ['conversation'], config);
  }
}

module.exports = adkSessionHook;
