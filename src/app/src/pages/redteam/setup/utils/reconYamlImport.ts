import { countPopulatedFields } from './applicationDefinition';

import type { Config, ReconContext } from '../types';

interface ReconYamlMetadata {
  version?: number;
  source?: string;
  generatedAt?: string;
  scannedDirectory?: string;
  applicationDefinition?: Config['applicationDefinition'];
  reconDetails?: {
    stateful?: boolean;
    entities?: string[];
    keyFiles?: unknown[];
    discoveredTools?: unknown[];
    securityNotes?: string[];
  };
}

interface ReconYamlConfig {
  metadata?: ReconYamlMetadata;
  [key: string]: unknown;
}

export function isReconYamlConfig(yamlConfig: ReconYamlConfig): boolean {
  return yamlConfig.metadata?.version === 1 && yamlConfig.metadata?.source === 'recon-cli';
}

function buildReconContext(metadata: ReconYamlMetadata, config: Config): ReconContext {
  const generatedAt = metadata.generatedAt;
  const timestamp = generatedAt ? new Date(generatedAt).getTime() : Date.now();

  return {
    source: 'recon-cli',
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
    codebaseDirectory: metadata.scannedDirectory,
    keyFilesAnalyzed: metadata.reconDetails?.keyFiles?.length,
    fieldsPopulated: countPopulatedFields(config.applicationDefinition),
    discoveredToolsCount: metadata.reconDetails?.discoveredTools?.length,
    securityNotes: metadata.reconDetails?.securityNotes,
  };
}

function applyApplicationDefinition(metadata: ReconYamlMetadata, config: Config): Config {
  const reconAppDef = metadata.applicationDefinition;
  if (!reconAppDef) {
    return config;
  }

  return {
    ...config,
    applicationDefinition: {
      ...config.applicationDefinition,
      purpose: reconAppDef.purpose || config.applicationDefinition.purpose,
      features: reconAppDef.features,
      industry: reconAppDef.industry,
      systemPrompt: reconAppDef.systemPrompt,
      hasAccessTo: reconAppDef.hasAccessTo,
      doesNotHaveAccessTo: reconAppDef.doesNotHaveAccessTo,
      userTypes: reconAppDef.userTypes,
      securityRequirements: reconAppDef.securityRequirements,
      sensitiveDataTypes: reconAppDef.sensitiveDataTypes,
      exampleIdentifiers: reconAppDef.exampleIdentifiers,
      criticalActions: reconAppDef.criticalActions,
      forbiddenTopics: reconAppDef.forbiddenTopics,
      attackConstraints: reconAppDef.attackConstraints,
      competitors: reconAppDef.competitors,
      connectedSystems:
        reconAppDef.connectedSystems || config.applicationDefinition.connectedSystems,
      redteamUser: reconAppDef.redteamUser || config.applicationDefinition.redteamUser,
    },
  };
}

function applyReconDetails(metadata: ReconYamlMetadata, config: Config): Config {
  const reconDetails = metadata.reconDetails;
  if (!reconDetails) {
    return config;
  }

  let updatedConfig = config;

  if (reconDetails.stateful && typeof updatedConfig.target === 'object') {
    updatedConfig = {
      ...updatedConfig,
      target: {
        ...updatedConfig.target,
        config: {
          ...updatedConfig.target.config,
          stateful: true,
        },
      },
    };
  }

  if (!updatedConfig.entities?.length && reconDetails.entities?.length) {
    updatedConfig = {
      ...updatedConfig,
      entities: reconDetails.entities,
    };
  }

  return updatedConfig;
}

export function applyReconYamlMetadata(
  yamlConfig: ReconYamlConfig,
  mappedConfig: Config,
): {
  updatedConfig: Config;
  reconContext: ReconContext | null;
} {
  if (!isReconYamlConfig(yamlConfig) || !yamlConfig.metadata) {
    return { updatedConfig: mappedConfig, reconContext: null };
  }

  let updatedConfig = applyApplicationDefinition(yamlConfig.metadata, mappedConfig);
  updatedConfig = applyReconDetails(yamlConfig.metadata, updatedConfig);

  return {
    updatedConfig,
    reconContext: buildReconContext(yamlConfig.metadata, updatedConfig),
  };
}
