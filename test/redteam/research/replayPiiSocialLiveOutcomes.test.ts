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
    expect(parsed.providers[0]?.config.url).toBe('http://localhost:3090/api/chat');
  });

  it('summarizes realized failures beside the leak-ready proxy', () => {
    const rows = summarizePiiSocialLiveOutcomeReplay({
      results: {
        results: [
          {
            success: true,
            testCase: { metadata: { cohort: 'legacy-generic', leakReady: false } },
          },
          {
            success: false,
            testCase: { metadata: { cohort: 'legacy-generic', leakReady: true } },
          },
          {
            success: false,
            testCase: { metadata: { cohort: 'portfolio', leakReady: true } },
          },
          {
            success: true,
            testCase: { metadata: { cohort: 'portfolio', leakReady: true } },
          },
        ],
      },
    });

    expect(rows).toEqual([
      {
        cohort: 'legacy-generic',
        leakReadyPrompts: '1/2',
        realizedFailures: '1/2',
        totalPrompts: 2,
      },
      {
        cohort: 'portfolio',
        leakReadyPrompts: '2/2',
        realizedFailures: '1/2',
        totalPrompts: 2,
      },
    ]);
    expect(renderPiiSocialLiveOutcomeReplayMarkdown(rows)).toContain(
      '| legacy-generic | 1/2 | 1/2 |',
    );
  });
});
