import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { findTeam, getOldestTeam, getUserTeams } from './cloud';

type UserTeam = Awaited<ReturnType<typeof getUserTeams>>[number];

/** Validate and resolve a complete Cloud session before replacing the saved login. */
export async function loginWithApiKey(
  token: string,
  apiHost?: string,
  options: {
    authHeaderName?: string;
    organizationId?: string;
    teamIdentifier?: string;
    selectTeam?: (teams: UserTeam[]) => Promise<UserTeam>;
  } = {},
) {
  const requestConfig = cloudConfig.getRequestConfig();
  const normalizedApiHost = (apiHost || requestConfig.apiHost).replace(/\/+$/, '');
  const authHeaderName = options.authHeaderName || requestConfig.authHeaderName;
  const validation = await cloudConfig.validateApiToken(token, normalizedApiHost, authHeaderName);
  let organizationId = options.organizationId || validation.organization.id;
  let selectedTeam: UserTeam | undefined;
  let allTeams: UserTeam[] = [];
  let teamsLookedUp = false;
  try {
    allTeams = await getUserTeams(normalizedApiHost, token, authHeaderName);
    teamsLookedUp = true;
  } catch (error) {
    if (options.organizationId || options.teamIdentifier) {
      throw error;
    }
    logger.warn('Could not refresh team context; keeping the saved team preference.', { error });
  }

  let organizationTeams = allTeams.filter((team) => team.organizationId === organizationId);
  if (organizationTeams.length === 0 && organizationId !== validation.organization.id) {
    const organizationIds = [
      ...new Set([validation.organization.id, ...allTeams.map((team) => team.organizationId)]),
    ].join(', ');
    throw new Error(
      `Organization '${organizationId}' not found in your accessible teams. Available organizations: ${organizationIds}`,
    );
  }

  if (options.teamIdentifier) {
    const candidateTeams = options.organizationId ? organizationTeams : allTeams;
    selectedTeam = findTeam(candidateTeams, options.teamIdentifier, organizationId);
    if (!selectedTeam) {
      const availableTeams = candidateTeams.map((team) => team.name).join(', ');
      const organizationLabel = options.organizationId
        ? ` in organization '${organizationId}'`
        : '';
      throw new Error(
        `Team '${options.teamIdentifier}' not found${organizationLabel}. Available teams: ${availableTeams}`,
      );
    }
    organizationId = selectedTeam.organizationId;
    organizationTeams = allTeams.filter((team) => team.organizationId === organizationId);
  } else {
    const savedTeamId = cloudConfig.getCurrentTeamId(organizationId);
    selectedTeam = organizationTeams.find((team) => team.id === savedTeamId);
    if (!selectedTeam && organizationTeams.length > 0) {
      selectedTeam =
        !savedTeamId && organizationTeams.length > 1 && options.selectTeam
          ? await options.selectTeam(organizationTeams)
          : getOldestTeam(organizationTeams);
    }
  }

  if (organizationTeams.length === 0 && allTeams.length > 0 && !options.organizationId) {
    logger.warn(
      `No accessible teams in organization '${organizationId}'. Log in with an API key for the organization you want to use: 'promptfoo auth login --api-key <apiKey>'.`,
    );
  }

  cloudConfig.saveValidatedApiToken({
    ...validation,
    token,
    apiHost: normalizedApiHost,
    authHeaderName,
    organizationId,
    teamId: teamsLookedUp ? (selectedTeam?.id ?? null) : undefined,
  });
  return { ...validation, organizationId, team: selectedTeam };
}
