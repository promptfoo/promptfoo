export function getDateTimeForFilename(): string {
  const isoWithoutMs = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return isoWithoutMs.replace(/[:]/g, '').replace('T', '_').replace('Z', '');
}
