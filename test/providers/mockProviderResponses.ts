export const createMockFetchResponse = <T>(
  data: T,
  { cached = false, status = 200, statusText = 'OK' } = {},
) => ({
  data,
  cached,
  status,
  statusText,
});
