export interface GlobalConfig {
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
