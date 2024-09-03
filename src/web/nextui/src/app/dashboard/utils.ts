export function calculateTrend(current: number, previous: number, increaseIsBad: boolean) {
  const difference = current - previous;
  const percentChange = difference / previous;

  let direction: 'up' | 'down' | 'flat';
  if (percentChange > 0.01) {
    direction = 'up';
  } else if (percentChange < -0.01) {
    direction = 'down';
  } else {
    direction = 'flat';
  }

  let sentiment: 'good' | 'bad' | 'flat';
  if (increaseIsBad) {
    sentiment = direction === 'up' ? 'bad' : direction === 'down' ? 'good' : 'flat';
  } else {
    sentiment = direction === 'up' ? 'good' : direction === 'down' ? 'bad' : 'flat';
  }

  return {
    direction,
    value: Math.abs(percentChange),
    sentiment,
  };
}
