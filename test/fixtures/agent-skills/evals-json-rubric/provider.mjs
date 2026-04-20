export default class EvalsJsonRubricProvider {
  id() {
    return 'evals-json-rubric-provider';
  }

  async callApi(_prompt, context = {}) {
    const vars = context.vars || {};
    return {
      output: JSON.stringify({
        invoice_id: vars.invoice_id || 'inv-unknown',
        status: 'approved',
        risk: 'low',
        reasons: ['policy-match', 'low-risk'],
      }),
    };
  }
}
