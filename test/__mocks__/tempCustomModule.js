class CustomApiProvider {
  async callApi(prompt) {
    return {
      output: 'Custom output',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    };
  }
}

module.exports.default = CustomApiProvider;
