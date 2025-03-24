/**
 * Hook to create a new threadId for each test case.
 * This demonstrates how to use extension hooks in promptfoo.
 */
async function createThreadHook(hookName, context) {
  // Only run for the beforeEach hook
  if (hookName === 'beforeEach') {
    console.log(`Running beforeEach hook for test: ${context.test.description || 'Unnamed test'}`);

    // Generate a random threadId
    const threadId = `thread_${Math.random().toString(36).substring(2, 15)}`;

    // Add threadId to the test context
    if (!context.test.vars) {
      context.test.vars = {};
    }

    // Store the threadId in the test vars
    context.test.vars.threadId = threadId;

    console.log(`Generated threadId: ${threadId}`);
  }

  // For demonstration, also log when other hooks are called
  if (hookName === 'beforeAll') {
    console.log('Starting test suite execution with threadId support');
  } else if (hookName === 'afterEach') {
    console.log(`Completed test: ${context.test.description || 'Unnamed test'}`);
    // You could log the threadId used or clean up resources here
    console.log(`Used threadId: ${context.test.vars?.threadId || 'No threadId'}`);
  } else if (hookName === 'afterAll') {
    console.log('Finished all tests with threadId support');
  }
}

module.exports = createThreadHook;
