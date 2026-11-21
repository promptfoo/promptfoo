// A pass here makes the smoke test fail if any expected deterministic check is skipped.
module.exports = class FixtureJudge {
  id() {
    return 'coding-agent-control-judge';
  }
  async callApi() {
    return { output: JSON.stringify({ pass: true, score: 1, reason: 'Fixture rubric fallback' }) };
  }
};
