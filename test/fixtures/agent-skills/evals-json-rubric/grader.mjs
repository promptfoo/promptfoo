export default class EvalsJsonRubricGrader {
  id() {
    return 'evals-json-rubric-grader';
  }

  async callApi(prompt) {
    const { candidate } = JSON.parse(prompt);
    const answer = JSON.parse(candidate);
    const pass =
      answer.invoice_id === 'inv-123' && answer.status === 'approved' && answer.risk === 'low';
    return {
      output: JSON.stringify({
        pass,
        score: pass ? 1 : 0,
        reason: pass
          ? 'Deterministic grader: invoice approval criteria satisfied.'
          : 'Deterministic grader: missing invoice id, approval, or risk details.',
      }),
    };
  }
}
