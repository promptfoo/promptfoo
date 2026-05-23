import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  buildPiiSocialLiveOutcomeReplayConfig,
  renderPiiSocialLiveOutcomeReplayConfigYaml,
  renderPiiSocialLiveOutcomeReplayMarkdown,
  summarizePiiSocialLiveOutcomeReplay,
} from '../../../scripts/redteam-research/replayPiiSocialLiveOutcomes';

describe('replayPiiSocialLiveOutcomes', () => {
  it('builds a runnable medical-agent replay config with both live cohorts', () => {
    const config = buildPiiSocialLiveOutcomeReplayConfig();

    expect(config.tests).toHaveLength(12);
    expect(config.defaultTest.metadata).toMatchObject({
      pluginId: 'pii:social',
      purpose: expect.stringContaining('medical agent'),
      targetRegime: 'hardened-medical-agent',
    });
    expect(config.tests[0]).toMatchObject({
      description: 'legacy-generic prompt 1',
      metadata: {
        cohort: 'legacy-generic',
        leakReady: false,
      },
    });
    expect(config.tests.at(-1)).toMatchObject({
      description: 'portfolio prompt 6',
      metadata: {
        cohort: 'portfolio',
        leakReady: true,
      },
    });
  });

  it('renders parseable yaml for the replay config', () => {
    const rendered = renderPiiSocialLiveOutcomeReplayConfigYaml();
    const parsed = yaml.load(rendered) as ReturnType<typeof buildPiiSocialLiveOutcomeReplayConfig>;

    expect(parsed.tests).toHaveLength(12);
    expect(parsed.providers[0]?.config?.url).toBe('http://localhost:3090/api/chat');
  });

  it('can render the deterministic permissive-family target regime', () => {
    const config = buildPiiSocialLiveOutcomeReplayConfig('permissive-family');

    expect(config.description).toContain('permissive-family');
    expect(config.defaultTest.metadata.targetRegime).toBe('permissive-family');
    expect(config.providers[0]?.id).toContain('permissivePiiSocialFamilyProvider.cjs');
  });

  it('can render the deterministic permissive-self-recovery target regime', () => {
    const config = buildPiiSocialLiveOutcomeReplayConfig('permissive-self-recovery');

    expect(config.description).toContain('permissive-self-recovery');
    expect(config.defaultTest.metadata.targetRegime).toBe('permissive-self-recovery');
    expect(config.providers[0]?.id).toContain('permissivePiiSocialSelfRecoveryProvider.cjs');
  });

  it('summarizes realized failures beside the leak-ready proxy', () => {
    const rows = summarizePiiSocialLiveOutcomeReplay({
      results: {
        results: [
          {
            success: true,
            testCase: {
              metadata: {
                cohort: 'legacy-generic',
                leakReady: false,
                targetRegime: 'permissive-family',
              },
            },
          },
          {
            success: false,
            testCase: {
              metadata: {
                cohort: 'legacy-generic',
                leakReady: true,
                targetRegime: 'permissive-family',
              },
            },
          },
          {
            success: false,
            testCase: {
              metadata: {
                cohort: 'portfolio',
                leakReady: true,
                targetRegime: 'permissive-family',
              },
            },
          },
          {
            success: true,
            testCase: {
              metadata: {
                cohort: 'portfolio',
                leakReady: true,
                targetRegime: 'permissive-family',
              },
            },
          },
        ],
      },
    });

    expect(rows).toEqual([
      {
        cohort: 'legacy-generic',
        leakReadyPrompts: '1/2',
        realizedFailures: '1/2',
        targetRegime: 'permissive-family',
        totalPrompts: 2,
      },
      {
        cohort: 'portfolio',
        leakReadyPrompts: '2/2',
        realizedFailures: '1/2',
        targetRegime: 'permissive-family',
        totalPrompts: 2,
      },
    ]);
    expect(renderPiiSocialLiveOutcomeReplayMarkdown(rows)).toContain(
      '| permissive-family | legacy-generic | 1/2 | 1/2 |',
    );
  });
});
