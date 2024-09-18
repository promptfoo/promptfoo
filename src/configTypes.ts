export interface GlobalConfig {
  hasRun?: boolean;
  hasHarmfulRedteamConsent?: boolean;
  account?: {
    email?: string;
  };
  cloud?: {
    apiHost?: string;
    apiKey?: string;
  };
}
