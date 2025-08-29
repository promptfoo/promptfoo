import logger from '../../logger';
import { getProviderIds } from '../../providers';
import { UnifiedConfig } from '../../types';
import { providerToIdentifier } from '..';
import {
  canCreateTargets,
  checkIfCliTargetExists,
  getDefaultTeam,
  isCloudProvider,
} from '../cloud';

export async function canContinueWithTarget(
  providers: UnifiedConfig['providers'] | undefined,
  teamId: string | undefined,
) {
  logger.debug(
    `[canContinueWithTarget] Checking provider permissions for ${providers} on team ${teamId}`,
  );

  if (!providers) {
    return true;
  }

  const providerIds = getProviderIds(providers);
  if (providerIds.length === 0) {
    return true;
  }

  let effectiveTeamId = teamId;
  if (!effectiveTeamId) {
    try {
      const defaultTeam = await getDefaultTeam();
      effectiveTeamId = defaultTeam.id;
      logger.debug(`Using default team ${defaultTeam.name} (${effectiveTeamId})`);
    } catch (error) {
      logger.debug(`Failed to get default team: ${error}`);
      // Continue without team ID - will fail at checkIfCliTargetExists if needed
      effectiveTeamId = '';
    }
  }

  // Get all provider identifiers
  const providersArray = Array.isArray(providers) ? providers : [providers];
  const identifiers: string[] = [];

  for (let i = 0; i < providersArray.length; i++) {
    // Skip cloud providers
    if (isCloudProvider(providerIds[i])) {
      continue;
    }

    const identifier = providerToIdentifier(providersArray[i]);

    if (identifier) {
      identifiers.push(identifier);
    }
  }

  // If no non-cloud identifiers found, return true
  if (identifiers.length === 0) {
    return true;
  }

  try {
    const canCreate = await canCreateTargets(effectiveTeamId);

    for (const identifier of identifiers) {
      logger.debug(`Checking target permissions for ${identifier} on team ${effectiveTeamId}`);

      const exists = await checkIfCliTargetExists(identifier, effectiveTeamId);

      if (exists) {
        logger.debug(`Provider ${identifier} exists on team ${effectiveTeamId}`);
        continue;
      }

      if (canCreate) {
        logger.debug(
          `Provider ${identifier} does not exist on team ${effectiveTeamId}, but can be created`,
        );
        continue;
      }

      logger.warn(
        `Provider ${identifier} does not exist on team ${effectiveTeamId} and cannot be created. User does not have permissions.`,
      );
      return false;
    }
  } catch (error) {
    logger.warn(`Error checking if user can create targets: ${error}. Continuing anyway.`);
    // If we can't check permissions, allow the operation to continue
    // It will fail later with a proper error message if permissions are actually missing
  }

  return true;
}
