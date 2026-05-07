const { handlePrivacyRequest } = require('./privacy-agent.cjs');

class PrivacyRightsWorkflowProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'privacy-rights-workflow-sample';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    const result = handlePrivacyRequest(prompt, {
      mode: this.config.mode,
    });

    return {
      output: result.output,
      metadata: result.metadata,
    };
  }
}

module.exports = PrivacyRightsWorkflowProvider;
