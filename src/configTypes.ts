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
    authHeaderName?: string;
    currentOrganizationId?: string;
    // Binds an environment-only selection to its credential and API routing, without saving the key.
    selectionContext?: string;
    sharing?: boolean;
    currentTeamId?: string;
    teams?: {
      [organizationId: string]: {
        currentTeamId?: string;
      };
    };
  };
}
