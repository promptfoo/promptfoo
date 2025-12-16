class CustomApiProvider {
  id() {
    return 'custom-api-provider';
  }

  async callApi(_prompt: string) {
    return {
      output: 'Custom output',
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    };
  }
}

export default CustomApiProvider;
