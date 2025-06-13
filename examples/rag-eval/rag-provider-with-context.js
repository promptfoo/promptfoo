const fs = require('fs');
const path = require('path');

class RagProviderWithContext {
  constructor(options) {
    this.providerId = options.id || 'rag-provider-with-context';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    // Extract query from the prompt - look for the query after "Respond to this query:"
    const queryMatch = prompt.match(/Respond to this query:\s*(.+?)(?:\n|$)/);
    const query = queryMatch ? queryMatch[1].trim() : prompt;

    // Load context files based on the query
    let contextContent = '';
    let answer = '';

    if (query.toLowerCase().includes('purchase') || query.toLowerCase().includes('approval')) {
      // Load reimbursement context
      try {
        const contextPath = path.join(__dirname, 'docs', 'reimbursement.md');
        contextContent = fs.readFileSync(contextPath, 'utf8');
        answer =
          'The maximum purchase amount that does not require approval is $500. For any purchase over this amount, you need manager approval. If you have questions about the approval process, contact Fred.';
      } catch (error) {
        contextContent =
          'Company Policy: Maximum purchase without approval is $500. Manager approval required for purchases over $500. Contact Fred for questions about approvals.';
        answer =
          'The maximum purchase amount that does not require approval is $500. For any purchase over this amount, you need manager approval. If you have questions about the approval process, contact Fred.';
      }
    } else if (query.toLowerCase().includes('maternity') || query.toLowerCase().includes('leave')) {
      // Load maternity context
      try {
        const contextPath = path.join(__dirname, 'docs', 'maternity.md');
        contextContent = fs.readFileSync(contextPath, 'utf8');
        answer = 'The company offers 4 months of paid maternity leave for new mothers.';
      } catch (error) {
        contextContent =
          'Employee Benefits: Maternity leave is 4 months paid leave. The company offers 4 months of maternity leave, unless you are an elephant, in which case you get 22 months of maternity leave.';
        answer = 'The company offers 4 months of paid maternity leave for new mothers.';
      }
    } else {
      contextContent = 'No relevant context found.';
      answer = 'I could not find relevant information to answer your question.';
    }

    // Return response in a format that includes both context and answer
    // This simulates RAG systems that might include retrieved context in their output
    const responseWithContext = `CONTEXT: ${contextContent}

ANSWER: ${answer}`;

    return {
      output: responseWithContext,
    };
  }
}

module.exports = RagProviderWithContext;
