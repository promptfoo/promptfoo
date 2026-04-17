class DefaultTestLlmRubricGrader {
  id() {
    return 'defaulttest-llm-rubric-grader';
  }

  async callApi(prompt) {
    const hasRenderedVar = ['hello world', 'goodbye moon'].some((value) => prompt.includes(value));
    const hasRawTemplate = prompt.includes('{{myVar}}');
    const pass = hasRenderedVar && !hasRawTemplate;

    return {
      output: JSON.stringify({
        pass,
        score: pass ? 1 : 0,
        reason: prompt,
      }),
    };
  }
}

module.exports = DefaultTestLlmRubricGrader;
