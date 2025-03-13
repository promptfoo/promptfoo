import type { ResultsFile, EvaluateResult } from '@promptfoo/types';
import { stringify } from 'csv-stringify/browser/esm/sync';
import { getPluginIdFromResult } from '../components/shared';

export function convertEvalDataToCsv(evalData: ResultsFile): string {
  const rows = evalData.results.results.map((result: EvaluateResult, index: number) => ({
    'Test ID': index + 1,
    Category: getPluginIdFromResult(result),
    Strategy: result.gradingResult?.componentResults?.[0]?.assertion?.metric || '',
    Prompt:
      result.vars.query?.toString() || result.vars.prompt?.toString() || result.prompt.raw || '',
    Response: result.response?.output || '',
    Pass: result.gradingResult?.pass ? 'Pass' : 'Fail',
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
