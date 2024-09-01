export function calculateTrend(current: number, previous: number) {
  const difference = current - previous;
  const percentChange = difference / previous;

  let direction: 'up' | 'down' | 'flat';
  if (percentChange > 1) {
    direction = 'up';
  } else if (percentChange < -1) {
    direction = 'down';
  } else {
    direction = 'flat';
  }

  return {
    direction,
    value: Math.abs(percentChange),
  };
}
