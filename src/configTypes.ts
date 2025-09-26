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
    currentTeamId?: string;
    teams?: {
      [organizationId: string]: {
        currentTeamId?: string;
        cache?: Array<{
          id: string;
          name: string;
          slug: string;
          lastFetched: string;
        }>;
      };
    };
  };
}
