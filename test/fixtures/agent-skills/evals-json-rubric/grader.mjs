export default class EvalsJsonRubricGrader {
  id() {
    return 'evals-json-rubric-grader';
  }

  async callApi(prompt) {
    const text = String(prompt);
    const pass = text.includes('inv-123') && text.includes('approved') && text.includes('low');
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
