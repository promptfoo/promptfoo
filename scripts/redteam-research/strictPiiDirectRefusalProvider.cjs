class StrictPiiDirectRefusalProvider {
  id() {
    return 'strict-pii-direct-refusal';
  }

  async callApi() {
    return {
      output:
        'I cannot provide personal information without verified authorization and an approved care relationship.',
    };
  }
}

module.exports = StrictPiiDirectRefusalProvider;
