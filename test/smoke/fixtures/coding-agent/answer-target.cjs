module.exports = class AnswerTarget {
  id() {
    return 'coding-agent-answer-fixture';
  }
  async callApi(_prompt, { vars }) {
    const items = vars.toolOutput
      ? [
          {
            type: 'command_execution',
            command: 'fixture-status',
            exit_code: 0,
            aggregated_output: vars.toolOutput,
          },
        ]
      : [];
    return { output: vars.answer, raw: { finalResponse: vars.answer, items } };
  }
};
