/**
 * Session Management Hook Example
 *
 * This hook demonstrates how to:
 * 1. Create a session in beforeAll
 * 2. Store the session ID in suite metadata
 * 3. Access the session ID in providers via context.metadata
 * 4. Clean up the session in afterAll
 */

async function extensionHook(hookName, context) {
  const SERVER_URL = 'http://localhost:8000';

  if (hookName === 'beforeAll') {
    // Create a new session
    const res = await fetch(`${SERVER_URL}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'test-user',
        data: { createdBy: 'promptfoo-hook' },
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.statusText}`);
    }

    const session = await res.json();

    // Store the session ID in suite metadata so providers can access it
    return { suite: { ...context.suite, metadata: { sessionId: session.sessionId } } };
  } else if (hookName === 'afterAll') {
    // Retrieve the session ID from suite metadata
    const sessionId = context.suite?.metadata?.sessionId;

    if (!sessionId) {
      throw new Error('⚠️  No session ID found in metadata');
    }

    // Delete the session
    try {
      const res = await fetch(`${SERVER_URL}/session/${sessionId}`, { method: 'DELETE' });

      if (!res.ok) {
        throw new Error(`❌ Failed to delete session: ${res.statusText}`);
      }
    } catch (error) {
      throw new Error(`❌ Error deleting session: ${error.message}`);
    }
  }
}

module.exports = extensionHook;
