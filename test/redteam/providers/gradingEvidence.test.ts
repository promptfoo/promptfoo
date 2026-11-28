import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeExfilEvidence } from '../../../src/redteam/grading/storedResult';
import { prepareGradingEvidence } from '../../../src/redteam/providers/gradingEvidence';
import * as tracking from '../../../src/redteam/strategies/indirectWebPwn';

describe('redteam grading evidence', () => {
  afterEach(() => vi.restoreAllMocks());

  it('checks the server when a provider has not observed exfiltration', async () => {
    const lookup = vi.spyOn(tracking, 'checkExfilTracking').mockResolvedValue({
      wasExfiltrated: true,
      exfilCount: 1,
      exfilRecords: [],
    });
    const context = await prepareGradingEvidence({
      response: { output: 'Done', metadata: { wasExfiltrated: false } },
      trackingMetadata: { webPageUuid: 'page' },
      evaluationId: 'evaluation',
    });
    expect(lookup).toHaveBeenCalledOnce();
    expect(context).toMatchObject({ wasExfiltrated: true, exfilCount: 1 });
  });

  it('preserves a provider-confirmed event without an unnecessary server lookup', async () => {
    const lookup = vi.spyOn(tracking, 'checkExfilTracking');
    const context = await prepareGradingEvidence({
      response: { output: 'Done', metadata: { wasExfiltrated: true, exfilCount: 1 } },
      trackingMetadata: { webPageUuid: 'page' },
      evaluationId: 'evaluation',
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(
      mergeExfilEvidence(context, { wasExfiltrated: false, exfilCount: 0, exfilRecords: [] }),
    ).toMatchObject({ wasExfiltrated: true, exfilCount: 1 });
  });
});
