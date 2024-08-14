async function extensionHook(hookName, context) {
  if (hookName === 'beforeAll') {
    console.log('Starting test suite:', context.suite.description);
    console.log('Initializing global test resources...');
  } else if (hookName === 'beforeEach') {
    console.log('Setting up test-specific resources...');
  } else if (hookName === 'afterEach') {
    console.log('Cleaning up test-specific resources...');
  } else if (hookName === 'afterAll') {
    console.log('Cleaning up global test resources...');
  }
}
module.exports = extensionHook;
