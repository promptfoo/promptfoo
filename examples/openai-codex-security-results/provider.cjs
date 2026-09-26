const responses = require('./responses.json');

// Hand-authored presentation fixtures. This provider never loads the security SDK.
module.exports = class SyntheticSecurityResultsProvider {
  id() {
    return 'synthetic-codex-security-results';
  }

  async callApi(_prompt, context) {
    const scenario = context?.vars?.scenario;
    if (!Object.hasOwn(responses, scenario)) {
      return { error: `Unknown synthetic scenario: ${scenario}` };
    }

    const fixture = structuredClone(responses[scenario]);
    const output = fixture.output;
    const metadata = {
      providerType: 'codex-security',
      synthetic: true,
      operation: fixture.operation,
      status: fixture.error ? 'failed' : 'completed',
      warnings: fixture.warnings ?? [],
      ...(output?.coverage ? { coverage: output.coverage } : {}),
      ...(output?.findings ? { findingsCount: output.findings.findings.length } : {}),
      ...(output?.disposition ? { disposition: output.disposition } : {}),
      ...(output?.cost ? { cost: output.cost } : {}),
    };

    return {
      metadata,
      ...(fixture.error
        ? { error: fixture.error }
        : { output: JSON.stringify(output), format: 'json' }),
      ...(output?.cost ? { cost: output.cost.estimatedUsd } : {}),
    };
  }
};
