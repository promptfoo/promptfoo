export default function gameResult(output: any, context: any) {
  const result = output?.result;
  const playAs = output?.summary?.playAs || 'w';
  const reason = output?.reason;

  if (!result) {
    return { pass: false, score: 0, reason: 'No game result found' };
  }

  // Determine score from GPT's perspective
  let score = 0;
  let outcome = '';

  if (result === '1-0') {
    // White won
    score = playAs === 'w' ? 1 : 0;
    outcome = playAs === 'w' ? 'WIN' : 'LOSS';
  } else if (result === '0-1') {
    // Black won
    score = playAs === 'b' ? 1 : 0;
    outcome = playAs === 'b' ? 'WIN' : 'LOSS';
  } else if (result === '1/2-1/2') {
    // Draw
    score = 0.5;
    outcome = 'DRAW';
  } else {
    // Unfinished
    score = 0;
    outcome = 'UNFINISHED';
  }

  const moves = output?.summary?.plyCount || 0;

  return {
    pass: true,
    score,
    reason: `${outcome} (${reason}) in ${moves} plies`,
  };
}
