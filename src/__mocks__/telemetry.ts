const mockTelemetry = {
  saveConsent: jest.fn().mockResolvedValue(undefined),
  track: jest.fn().mockResolvedValue(undefined),
  flush: jest.fn().mockResolvedValue(undefined),
  init: jest.fn().mockResolvedValue(undefined),
};

export default mockTelemetry;
