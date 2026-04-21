import { describe, expect, it } from 'vitest';
import { sampleBalancedSafetyRecords } from '../../../src/redteam/plugins/safetyBalance';

describe('sampleBalancedSafetyRecords', () => {
  it('returns a balanced mix with one extra unsafe record for odd limits', () => {
    const safeRecords = ['safe-1', 'safe-2', 'safe-3'];
    const unsafeRecords = ['unsafe-1', 'unsafe-2', 'unsafe-3'];

    const result = sampleBalancedSafetyRecords(safeRecords, unsafeRecords, 5);

    expect(result).toHaveLength(5);
    expect(result.filter((record) => record.startsWith('safe'))).toHaveLength(2);
    expect(result.filter((record) => record.startsWith('unsafe'))).toHaveLength(3);
  });

  it('fills from the available side when one side is underrepresented', () => {
    const safeRecords = ['safe-1'];
    const unsafeRecords = ['unsafe-1', 'unsafe-2', 'unsafe-3', 'unsafe-4'];

    const result = sampleBalancedSafetyRecords(safeRecords, unsafeRecords, 4);

    expect(result).toHaveLength(4);
    expect(result.filter((record) => record.startsWith('safe'))).toHaveLength(1);
    expect(result.filter((record) => record.startsWith('unsafe'))).toHaveLength(3);
  });

  it('returns an unsafe record for a single-item limit when unsafe records are available', () => {
    const result = sampleBalancedSafetyRecords(['safe-1'], ['unsafe-1'], 1);

    expect(result).toEqual(['unsafe-1']);
  });
});
