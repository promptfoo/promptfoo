export interface GlobalConfig {
  hasHarmfulRedteamConsent?: boolean;
  account?: {
    email?: string;
    verifiedEmailKey?: string;
  };
  cloud?: {
    appUrl?: string;
    apiHost?: string;
    apiKey?: string;
  };
}
