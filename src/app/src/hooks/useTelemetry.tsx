const recordEvent = (_eventName: string, _properties: Record<string, unknown> = {}) => {};
const identifyUser = (_userId: string, _userProperties: Record<string, unknown> = {}) => {};

export const useTelemetry = () => ({
  recordEvent,
  identifyUser,
  isInitialized: false,
});
