import { stringify } from 'csv-stringify/browser/esm/sync';
import { getPluginIdFromResult, getStrategyIdFromTest } from '../components/shared';
import type { EvaluateResult, ResultsFile } from '@promptfoo/types';

export function convertEvalDataToCsv(evalData: ResultsFile): string {
  const rows = evalData.results.results.map((result: EvaluateResult, index: number) => ({
    'Test ID': index + 1,
    Plugin: getPluginIdFromResult(result),
    Strategy: getStrategyIdFromTest(result.testCase),
    Target: result.provider.label || result.provider.id || '',
    Prompt:
      result.vars.query?.toString() || result.vars.prompt?.toString() || result.prompt.raw || '',
    Response: result.response?.output || '',
    Pass:
      result.gradingResult?.pass === true
        ? `Pass${result.gradingResult?.score === undefined ? '' : ` (${result.gradingResult.score})`}`
        : `Fail${result.gradingResult?.score === undefined ? '' : ` (${result.gradingResult.score})`}`,
    Score: result.gradingResult?.score || '',
    Reason: result.gradingResult?.reason || '',
    Timestamp: new Date(evalData.createdAt).toISOString(),
  }));

  return stringify(rows, {
    header: true,
    quoted: true,
    quoted_string: true,
    quoted_empty: true,
  });
}
