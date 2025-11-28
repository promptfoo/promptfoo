/**
 * Dynamic variable loader for RAG-style context retrieval.
 *
 * This script demonstrates how to dynamically load context based on other
 * variables in the test case. The function receives:
 *   - varName: The name of the variable being loaded (e.g., "context")
 *   - prompt: The prompt template
 *   - otherVars: An object containing other variables in the test case
 *   - provider: The provider being used (optional)
 *
 * This is useful for RAG applications where you need to retrieve relevant
 * documents based on the user's question.
 */

// Simulated document store - in practice, this would be a vector database
const DOCUMENTS = {
  parental: `
    Parental Leave Policy:
    - Primary caregivers: 16 weeks paid leave
    - Secondary caregivers: 4 weeks paid leave
    - Can be taken within 12 months of birth/adoption
    - Flexible return-to-work options available
  `,
  vacation: `
    Vacation Policy:
    - New employees: 15 days per year
    - After 3 years: 20 days per year
    - After 5 years: 25 days per year
    - Unused days can roll over (max 5 days)
  `,
  remote: `
    Remote Work Guidelines:
    - Hybrid model: 3 days in office, 2 days remote
    - Core hours: 10am-3pm in your timezone
    - Home office stipend: $500 one-time
    - VPN required for all remote access
  `,
};

/**
 * Simulate RAG retrieval - find relevant documents for a question.
 *
 * In a real implementation, this would:
 * 1. Generate embeddings for the question
 * 2. Search a vector database
 * 3. Return the most relevant documents
 */
function retrieveDocuments(question) {
  const questionLower = question.toLowerCase();

  // Simple keyword matching (in practice, use semantic search)
  for (const [keyword, document] of Object.entries(DOCUMENTS)) {
    if (questionLower.includes(keyword)) {
      return document.trim();
    }
  }

  return 'No relevant documents found.';
}

/**
 * Dynamic variable loader function.
 *
 * @param {string} varName - Name of the variable being loaded
 * @param {string} prompt - The prompt template string
 * @param {object} otherVars - Object containing other variables from the test case
 * @param {object} provider - The provider being used (optional)
 * @returns {Promise<{output: string} | {error: string}>}
 */
module.exports = async function (varName, prompt, otherVars, provider) {
  // Get the question from other variables
  const question = otherVars.question || '';

  if (!question) {
    return { error: 'No question provided in test case' };
  }

  // Retrieve relevant context based on the question
  const context = retrieveDocuments(question);

  return { output: context };
};
