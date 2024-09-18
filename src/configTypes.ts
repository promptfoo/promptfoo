export interface GlobalConfig {
  hasRun?: boolean;
  hasHarmfulRedteamConsent?: boolean;
  account?: {
    email?: string;
  };
  cloud?: {
    appUrl?: string;
    apiHost?: string;
    apiKey?: string;
  };
}
