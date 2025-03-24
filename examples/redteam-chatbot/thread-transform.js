/**
 * This transform demonstrates how to use the threadId in API calls
 * It could be applied to test outputs before assertions are run
 */
function threadTransform(output, { vars }) {
  // Log that we're processing output with a specific threadId
  console.log(`Processing output for threadId: ${vars.threadId}`);

  // In a real implementation, you might do something with the threadId
  // such as retrieving conversation history from a database

  // For demo purposes, we're just adding the threadId to the output
  // In a real scenario, you might not modify the output at all
  return `[ThreadId: ${vars.threadId}] ${output}`;
}

module.exports = threadTransform;
