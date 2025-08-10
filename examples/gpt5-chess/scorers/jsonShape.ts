export default function jsonShape(output: any, context: any) {
  const ok =
    output &&
    typeof output === 'object' &&
    'pgn' in output &&
    'result' in output &&
    'reason' in output &&
    'summary' in output;

  return {
    pass: !!ok,
    score: ok ? 1 : 0,
    reason: ok ? 'Valid game output' : 'Missing required fields in output',
  };
}
