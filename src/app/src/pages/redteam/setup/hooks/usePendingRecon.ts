import { useCallback, useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SETUP_TAB_INDICES } from '../constants';
import { countPopulatedFields } from '../utils/applicationDefinition';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from './useRedTeamConfig';
import type { PendingReconConfig } from '@promptfoo/validators/recon';

import type { Config, ReconContext } from '../types';

interface UsePendingReconResult {
  /** Whether the hook is currently loading pending recon data */
  isLoading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Whether recon data was successfully applied */
  reconApplied: boolean;
  /** The recon context if available (for displaying in UI) */
  reconContext: ReconContext | null;
}

/**
 * Hook that checks for and applies pending recon configuration.
 *
 * When the page loads with `?source=recon`, this hook:
 * 1. Fetches the pending recon config from the server
 * 2. Applies it to the Zustand store
 * 3. Clears the pending file
 * 4. Navigates to the Review tab
 * 5. Cleans up the URL
 *
 * @param onReconApplied - Callback when recon is successfully applied (e.g., navigate to Review tab)
 * @param onError - Optional callback when loading fails (e.g., show toast notification)
 */
export function usePendingRecon(
  onReconApplied?: (tabIndex: number) => void,
  onError?: (message: string) => void,
): UsePendingReconResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconApplied, setReconApplied] = useState(false);
  const [reconContext, setReconContext] = useState<ReconContext | null>(null);

  const hasAttemptedLoad = useRef(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setFullConfig, setReconContext: setStoreReconContext } = useRedTeamConfig();

  const applyReconConfig = useCallback(
    async (data: PendingReconConfig) => {
      const { config: reconConfig, metadata } = data;

      // Build the full config for the Zustand store
      const stateful = metadata.reconDetails?.stateful ?? false;

      // Prepare target with stateful flag if needed
      let target = DEFAULT_HTTP_TARGET;
      if (stateful) {
        target = {
          ...DEFAULT_HTTP_TARGET,
          config: { ...DEFAULT_HTTP_TARGET.config, stateful: true },
        };
      }

      // Build application definition from recon metadata
      const appDef = metadata.applicationDefinition || {};
      const applicationDefinition = {
        purpose: appDef.purpose || reconConfig.redteam?.purpose || '',
        features: appDef.features,
        industry: appDef.industry,
        systemPrompt: appDef.systemPrompt,
        hasAccessTo: appDef.hasAccessTo,
        doesNotHaveAccessTo: appDef.doesNotHaveAccessTo,
        userTypes: appDef.userTypes,
        securityRequirements: appDef.securityRequirements,
        sensitiveDataTypes: appDef.sensitiveDataTypes,
        exampleIdentifiers: appDef.exampleIdentifiers,
        criticalActions: appDef.criticalActions,
        forbiddenTopics: appDef.forbiddenTopics,
        attackConstraints: appDef.attackConstraints,
        competitors: appDef.competitors,
        connectedSystems: appDef.connectedSystems,
        redteamUser: appDef.redteamUser || '',
        accessToData: appDef.hasAccessTo || '',
        forbiddenData: appDef.doesNotHaveAccessTo || '',
        accessToActions: '',
        forbiddenActions: '',
      };

      // Count meaningful fields for the ReconContext
      const meaningfulFields = countPopulatedFields(applicationDefinition);

      const fullConfig: Config = {
        description: reconConfig.description || 'Red Team Configuration (from Recon)',
        prompts: ['{{prompt}}'],
        target,
        plugins: (reconConfig.redteam?.plugins || ['default']) as Config['plugins'],
        strategies: (reconConfig.redteam?.strategies || ['basic']) as Config['strategies'],
        purpose: reconConfig.redteam?.purpose || '',
        entities: reconConfig.redteam?.entities || metadata.reconDetails?.entities || [],
        numTests: reconConfig.redteam?.numTests || REDTEAM_DEFAULTS.NUM_TESTS,
        maxConcurrency: REDTEAM_DEFAULTS.MAX_CONCURRENCY,
        applicationDefinition,
      };

      // Create ReconContext for tracking
      const newReconContext: ReconContext = {
        source: 'recon-cli',
        timestamp: metadata.timestamp,
        codebaseDirectory: metadata.codebaseDirectory,
        keyFilesAnalyzed: metadata.keyFilesAnalyzed,
        fieldsPopulated: meaningfulFields,
        discoveredToolsCount: metadata.reconDetails?.discoveredTools?.length,
        securityNotes: metadata.reconDetails?.securityNotes,
      };

      // Apply to store
      setFullConfig(fullConfig, newReconContext);
      setStoreReconContext(newReconContext);
      setReconContext(newReconContext);
    },
    [setFullConfig, setStoreReconContext],
  );

  useEffect(() => {
    // Only attempt once per mount
    if (hasAttemptedLoad.current) {
      return;
    }

    // Check for recon source in URL
    const source = searchParams.get('source');
    if (source !== 'recon') {
      return;
    }

    hasAttemptedLoad.current = true;

    const loadPendingRecon = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch pending recon config
        const response = await callApi('/redteam/recon/pending');

        if (response.status === 404) {
          // No pending config, clean up URL and notify user
          const errorMsg =
            'No pending recon configuration found. Run `promptfoo redteam recon` first.';
          setError(errorMsg);
          onError?.(errorMsg);
          navigate('/redteam/setup', { replace: true });
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch pending recon configuration');
        }

        const data: PendingReconConfig = await response.json();

        // Apply the configuration
        await applyReconConfig(data);

        // Clear the pending file to prevent re-application on next visit
        try {
          const deleteResponse = await callApi('/redteam/recon/pending', { method: 'DELETE' });
          if (!deleteResponse.ok) {
            // Log warning but continue - config was already applied successfully
            // If delete fails, the file may be re-applied on next visit, but that's
            // preferable to blocking the user flow
            console.warn(
              `Failed to clear pending recon file (status ${deleteResponse.status}). ` +
                'The file may be re-applied if you visit this page again.',
            );
          }
        } catch (deleteErr) {
          // Network error during delete - log but don't block
          console.warn('Failed to clear pending recon file:', deleteErr);
        }

        setReconApplied(true);

        // Clean up URL and navigate to Review tab
        navigate(`/redteam/setup#${SETUP_TAB_INDICES.REVIEW}`, { replace: true });

        // Notify parent to switch tabs
        if (onReconApplied) {
          onReconApplied(SETUP_TAB_INDICES.REVIEW);
        }
      } catch (err) {
        console.error('Failed to load pending recon config:', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to load recon configuration';
        setError(errorMsg);
        onError?.(errorMsg);
        // Clean up URL even on error
        navigate('/redteam/setup', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    loadPendingRecon();
  }, [searchParams, navigate, applyReconConfig, onReconApplied, onError]);

  return {
    isLoading,
    error,
    reconApplied,
    reconContext,
  };
}
