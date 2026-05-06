export const useTelemetry = () => {
  return {
    recordEvent: (_eventName: string, _properties: Record<string, unknown> = {}) => {},
    identifyUser: (_userId: string, _userProperties: Record<string, unknown> = {}) => {},
    isInitialized: false,
  };
};
