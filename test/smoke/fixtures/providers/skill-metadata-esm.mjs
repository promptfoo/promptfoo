/**
 * ESM provider that returns normalized skill metadata for CLI smoke coverage.
 */
export default class SkillMetadataProvider {
  id() {
    return 'skill-metadata-esm';
  }

  async callApi(prompt) {
    return {
      output: `Skill smoke: ${prompt}`,
      tokenUsage: {
        total: prompt.length,
        prompt: prompt.length,
        completion: 0,
      },
      metadata: {
        skillCalls: [
          {
            name: 'smoke-skill',
            source: 'tool',
          },
        ],
      },
    };
  }
}
