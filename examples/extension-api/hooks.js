let counter = 0;
async function extensionHook(hookName, context) {
  if (hookName === 'beforeAll') {
    console.log(`Setting up test suite: ${context.suite.description || 'Unnamed suite'}`);
    console.log(`Total prompts: ${context.suite.prompts?.length || 0}`);
    console.log(`Total providers: ${context.suite.providers?.length || 0}`);
    console.log(`Total tests: ${context.suite.tests?.length || 0}`);
  } else if (hookName === 'beforeEach') {
    console.log(`Preparing test`);
  } else if (hookName === 'afterEach') {
    console.log(
      `Completed test ${counter++}${context.result ? `, Result: ${context.result.success ? 'Pass' : 'Fail'}, Score: ${context.result.score}` : ''}`,
    );
  } else if (hookName === 'afterAll') {
    console.log('Test suite completed');
    console.log(`Total tests run: ${context.results?.length || 0}`);

    const successes = context.results?.filter((r) => r.success).length || 0;
    const failures = context.results?.filter((r) => !r.success).length || 0;
    console.log(`Successes: ${successes}`);
    console.log(`Failures: ${failures}`);

    const totalTokenUsage =
      context.results?.reduce((sum, r) => sum + (r.response?.tokenUsage?.total || 0), 0) || 0;
    console.log(`Total token usage: ${totalTokenUsage}`);
  }
}

module.exports = extensionHook;
