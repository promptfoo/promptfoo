export default class ContextRelevanceDemoJudge {
  id() {
    return 'context-relevance-demo-judge';
  }

  async callApi() {
    return {
      output: 'Paris is the capital of France.\nFrance is in Europe.',
    };
  }
}
