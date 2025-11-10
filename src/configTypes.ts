export interface GlobalConfig {
  id?: string;
  hasHarmfulRedteamConsent?: boolean;
  account?: {
    email?: string;
    emailNeedsValidation?: boolean;
    emailValidated?: boolean;
  };
  cloud?: {
    appUrl?: string;
    apiHost?: string;
    apiKey?: string;
    currentOrganizationId?: string;
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
