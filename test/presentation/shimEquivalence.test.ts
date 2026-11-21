import { describe, expect, it } from 'vitest';
import { convertResultsToTable } from '../../src/presentation/evalResults';
import { getRiskCategorySeverityMap, getUnifiedConfig } from '../../src/presentation/redteamConfig';
import { calculateAttackSuccessRate } from '../../src/presentation/redteamMetrics';
import { calculateAttackSuccessRate as legacyAttackSuccessRate } from '../../src/redteam/metrics';
import {
  getRiskCategorySeverityMap as legacySeverityMap,
  getUnifiedConfig as legacyUnifiedConfig,
} from '../../src/redteam/sharedFrontend';
import { convertResultsToTable as legacyConvertResultsToTable } from '../../src/util/convertEvalResultsToTable';

describe('presentation source compatibility', () => {
  it('preserves the functions shared with existing Node and cloud source consumers', () => {
    expect(legacyConvertResultsToTable).toBe(convertResultsToTable);
    expect(legacyAttackSuccessRate).toBe(calculateAttackSuccessRate);
    expect(legacySeverityMap).toBe(getRiskCategorySeverityMap);
    expect(legacyUnifiedConfig).toBe(getUnifiedConfig);
  });
});
