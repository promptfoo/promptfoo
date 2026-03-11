/**
 * @fileoverview Defines a hook and several helper functions for test-case session management.
 */

async function startSession() {
  const response = await fetch('http://localhost:8080/session');

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const sessionId = await response.text();
  return sessionId;
}

async function endSession(sessionId) {
  await fetch(`http://localhost:8080/session/${sessionId}`, {
    method: 'DELETE',
  });
}

async function extensionHook(hookName, context) {
  if (hookName === 'beforeEach') {
    return {
      test: {
        ...context.test,
        vars: { ...context.test.vars, sessionId: await startSession() },
      },
    };
  }
  if (hookName === 'afterEach') {
    await endSession(context.test.vars.sessionId);
  }
}

export { extensionHook };
