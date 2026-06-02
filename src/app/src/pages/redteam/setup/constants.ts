/**
 * Layout constants for the redteam setup page.
 *
 * These are extracted to a separate file to avoid circular dependencies between:
 * - page.tsx (defines the layout)
 * - PageWrapper.tsx (needs SIDEBAR_WIDTH for positioning)
 *
 * Both modules now import from this constants file instead of each other.
 */

import {
  isPrivacyRightsGeography,
  LEGACY_PRIVACY_FRAMEWORK_TO_GEOGRAPHY,
  PRIVACY_RIGHTS_GEOGRAPHIES,
  PRIVACY_RIGHTS_GEOGRAPHY_PROFILES,
  type PrivacyRightsGeography,
} from '@promptfoo/redteam/constants/privacy';
import type { PluginConfig } from '@promptfoo/redteam/types';

export const SIDEBAR_WIDTH = 240;
export const NAVBAR_HEIGHT = 64;

/**
 * Plugins that require additional configuration before they can be used.
 * Used across multiple plugin selection components.
 */
export const PLUGINS_REQUIRING_CONFIG = [
  'indirect-prompt-injection',
  'privacy-policy-consistency',
  'privacy:rights-request-workflow-integrity',
  'prompt-extraction',
] as const;
export type PluginRequiringConfig = (typeof PLUGINS_REQUIRING_CONFIG)[number];
export const PLUGINS_REQUIRING_CONFIG_SET: ReadonlySet<string> = new Set(PLUGINS_REQUIRING_CONFIG);

export const PRIVACY_RIGHTS_GEOGRAPHY_OPTIONS = PRIVACY_RIGHTS_GEOGRAPHIES.map((id) => ({
  id,
  label: PRIVACY_RIGHTS_GEOGRAPHY_PROFILES[id].displayName,
}));

const FILE_REF_PREFIX = 'file://';
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Type-safe check if a plugin requires configuration.
 */
export function requiresPluginConfig(plugin: string): plugin is PluginRequiringConfig {
  return PLUGINS_REQUIRING_CONFIG_SET.has(plugin as PluginRequiringConfig);
}

function normalizeStringList(value: unknown): { valid: boolean; values: string[] } {
  if (value === undefined) {
    return { valid: true, values: [] };
  }

  if (typeof value === 'string') {
    return {
      valid: true,
      values: value
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    };
  }

  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return { valid: false, values: [] };
  }

  return {
    valid: true,
    values: value.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  };
}

export function getConfiguredPrivacyRightsGeographies(
  config: Pick<PluginConfig, 'geographies' | 'frameworks'>,
): PrivacyRightsGeography[] {
  const geographies = normalizeStringList(config.geographies);
  if (!geographies.valid) {
    return [];
  }
  if (geographies.values.length > 0) {
    return geographies.values.filter(isPrivacyRightsGeography);
  }

  const frameworks = normalizeStringList(config.frameworks);
  if (!frameworks.valid) {
    return [];
  }

  return [
    ...new Set(
      frameworks.values
        .map(
          (framework) =>
            LEGACY_PRIVACY_FRAMEWORK_TO_GEOGRAPHY[
              framework as keyof typeof LEGACY_PRIVACY_FRAMEWORK_TO_GEOGRAPHY
            ],
        )
        .filter((geography): geography is PrivacyRightsGeography => Boolean(geography)),
    ),
  ];
}

function hasValidPrivacyRightsWorkflowConfig(config: PluginConfig): boolean {
  const geographies = normalizeStringList(config.geographies);
  if (!geographies.valid) {
    return false;
  }

  if (geographies.values.length > 0) {
    return geographies.values.every(isPrivacyRightsGeography);
  }

  const frameworks = normalizeStringList(config.frameworks);
  return (
    frameworks.valid &&
    frameworks.values.length > 0 &&
    frameworks.values.every((framework) =>
      Object.prototype.hasOwnProperty.call(LEGACY_PRIVACY_FRAMEWORK_TO_GEOGRAPHY, framework),
    )
  );
}

function isValidFileBackedTextReference(value: unknown, required: boolean): boolean {
  if (value === undefined) {
    return !required;
  }
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return !required;
  }

  return trimmed.startsWith(FILE_REF_PREFIX) || !URI_SCHEME_PATTERN.test(trimmed);
}

function hasValidPrivacyPolicyConsistencyConfig(config: PluginConfig): boolean {
  if (
    typeof config.privacyPolicyContent === 'string' &&
    config.privacyPolicyContent.trim() !== ''
  ) {
    return true;
  }

  return isValidFileBackedTextReference(config.privacyPolicy, true);
}

function hasValidPrivacyRightsWorkflowEvidence(config: PluginConfig): boolean {
  if (
    typeof config.rightsRequestPolicyContent === 'string' &&
    config.rightsRequestPolicyContent.trim() !== ''
  ) {
    return true;
  }

  return isValidFileBackedTextReference(config.rightsRequestPolicy, false);
}

function hasConfiguredValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value !== 'string' || value.trim() !== '';
}

export function isPluginConfigComplete(plugin: string, config: PluginConfig | undefined): boolean {
  if (!config || Object.keys(config).length === 0) {
    return false;
  }

  if (plugin === 'privacy-policy-consistency') {
    return hasValidPrivacyPolicyConsistencyConfig(config);
  }

  if (plugin === 'privacy:rights-request-workflow-integrity') {
    return (
      hasValidPrivacyRightsWorkflowConfig(config) && hasValidPrivacyRightsWorkflowEvidence(config)
    );
  }

  return Object.values(config).every(hasConfiguredValue);
}
