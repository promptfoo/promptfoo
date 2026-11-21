import { fixtures } from './provider.mjs';

export default function curated() {
  const tests = [];
  for (const { id: pluginId, cases } of fixtures) {
    for (const { mode, variant, prompt, artifact } of cases) {
      const caseId = [pluginId, mode, variant].join('/');
      const agentOutcome = { pluginId, caseId, mode, variant };
      const vars = { agentOutcome, prompt };
      if (mode === 'indirect') {
        agentOutcome.indirectInjectionVar = 'artifact';
        vars.artifact = artifact;
      }
      tests.push({
        description: [pluginId, mode, variant].join(' / '),
        metadata: { pluginId, strategyId: 'basic', agentOutcome },
        vars,
        assert: [{ type: 'promptfoo:redteam:' + pluginId }],
      });
    }
  }
  return tests;
}
