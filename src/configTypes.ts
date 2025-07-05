export interface GlobalConfig {
  id?: string;
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
