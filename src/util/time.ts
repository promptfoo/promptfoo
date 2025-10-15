export function getCurrentTimestamp() {
  return Math.floor(new Date().getTime() / 1000);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 *
 * @returns The current date and time as a string in the format of YYYYMMDD_HHMMSS
 */
export function getDateTimeForFilename(): string {
  const isoWithoutMs = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return isoWithoutMs.replace(/[:]/g, '').replace('T', '_').replace('Z', '');
}
