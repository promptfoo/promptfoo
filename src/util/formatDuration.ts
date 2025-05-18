/**
 * Formats a duration in seconds into a human-readable string
 * @param seconds Total duration in seconds
 * @returns Formatted string like "2h 5m 30s" or "45s" depending on duration
 */
export function formatDuration(seconds: number): string {
  const totalSeconds = Math.floor(seconds);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  let result = '';

  if (hours > 0) {
    result += `${hours}h `;
  }

  if (minutes > 0 || hours > 0) {
    result += `${minutes}m `;
  }

  result += `${remainingSeconds}s`;

  return result;
}
