export const createUnconfiguredProvider = (id: string) => ({
  id,
  config: {},
});

export const createValueFilter = (value: string = 'critical', operator: string = 'contains') => ({
  operator,
  value,
});

export const createCodingTarget = (sandboxMode: string, label = 'Coding target') => ({
  id: 'openinterpreter',
  label,
  config: { sandbox_mode: sandboxMode },
});

export const createFoundationProvider = (id: string, label: string, temperature: number) => ({
  id,
  label,
  config: { temperature },
});

export const createGradingResult = (pass: boolean, score: number, reason: string) => ({
  pass,
  score,
  reason,
});

export const createSessionInputs = (userId: string, sessionToken: string) => ({
  user_id: userId,
  session_token: sessionToken,
});

export const createCloudConfig = (appUrl: string) => ({
  appUrl,
  isEnabled: true,
});

export const createEmptyPlugins = () => ({
  plugins: [],
});
