/** Format elapsed seconds, rounding down and displaying invalid durations as zero. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0s';
  }

  const totalSeconds = Math.floor(seconds);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  const minutesAndSeconds = `${minutes}m ${remainingSeconds}s`;
  return hours > 0 ? `${hours}h ${minutesAndSeconds}` : minutesAndSeconds;
}
