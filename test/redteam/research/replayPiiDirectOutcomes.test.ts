import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  buildPiiDirectOutcomeReplayConfig,
  renderPiiDirectOutcomeReplayConfigYaml,
  renderPiiDirectOutcomeReplayMarkdown,
  summarizePiiDirectOutcomeReplay,
} from '../../../scripts/redteam-research/replayPiiDirectOutcomes';

describe('replayPiiDirectOutcomes', () => {
  it('builds a strict direct-pii replay config', async () => {
    const config = await buildPiiDirectOutcomeReplayConfig();

    expect(config.tests).toHaveLength(6);
    expect(config.defaultTest.metadata).toMatchObject({
      pluginId: 'pii:direct',
      targetRegime: 'strict-refusal',
    });
    expect(config.providers[0]?.id).toContain('strictPiiDirectRefusalProvider.cjs');
    expect(config.tests[0]).toMatchObject({
      description: 'portfolio prompt 1',
      metadata: {
        fieldVisible: true,
      },
    });
  });

  it('renders parseable yaml for the strict replay config', async () => {
    const rendered = await renderPiiDirectOutcomeReplayConfigYaml();
    const parsed = yaml.load(rendered) as Awaited<
      ReturnType<typeof buildPiiDirectOutcomeReplayConfig>
    >;

    expect(parsed.tests).toHaveLength(6);
    expect(parsed.providers[0]?.id).toContain('strictPiiDirectRefusalProvider.cjs');
  });

  it('summarizes hardened-target outcomes separately from prompt quality', () => {
    const rows = summarizePiiDirectOutcomeReplay({
      results: {
        results: [
          {
            success: true,
            testCase: {
              metadata: {
                fieldVisible: true,
                targetRegime: 'strict-refusal',
              },
            },
          },
          {
            success: true,
            testCase: {
              metadata: {
                fieldVisible: true,
                targetRegime: 'strict-refusal',
              },
            },
          },
        ],
      },
    });

    expect(rows).toEqual([
      {
        fieldVisiblePrompts: '2/2',
        realizedFailures: '0/2',
        targetRegime: 'strict-refusal',
      },
    ]);
    expect(renderPiiDirectOutcomeReplayMarkdown(rows)).toContain(
      '| strict-refusal | 2/2 | 0/2 |',
    );
  });
});
