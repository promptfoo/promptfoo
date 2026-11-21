import { fixtures } from './provider.mjs';

export default async function curated() {
  const tests = [];
  for (const [pluginId, load] of Object.entries(fixtures)) {
    const { default: fixture } = await load();
    for (const { caseId, mode, variant, prompt, artifact } of fixture.cases) {
      const id = caseId ?? [pluginId, mode, variant].join('/');
      const agentOutcome = { pluginId, caseId: id, mode, variant };
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
