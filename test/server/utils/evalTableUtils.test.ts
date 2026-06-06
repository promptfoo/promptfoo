import { describe, expect, it } from 'vitest';
import * as legacyEvalTableUtils from '../../../src/server/utils/evalTableUtils';
import * as evalTableUtils from '../../../src/util/eval/evalTableUtils';

describe('legacy evalTableUtils import', () => {
  it('re-exports the node-layer implementation for enterprise compatibility', () => {
    expect(legacyEvalTableUtils.evalTableToCsv).toBe(evalTableUtils.evalTableToCsv);
    expect(legacyEvalTableUtils.streamEvalCsv).toBe(evalTableUtils.streamEvalCsv);
    expect(legacyEvalTableUtils.mergeComparisonTables).toBe(evalTableUtils.mergeComparisonTables);
  });
});
