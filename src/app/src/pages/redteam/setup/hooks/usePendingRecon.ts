import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from './useRedTeamConfig';
import type { Config, ReconContext } from '../types';

/**
 * Pending recon data structure from the server
 */
interface PendingReconData {
  config: {
    description?: string;
    redteam?: {
      purpose?: string;
      plugins?: string[];
      strategies?: Array<string | { id: string; config?: Record<string, unknown> }>;
      entities?: string[];
      numTests?: number;
    };
  };
  metadata: {
    source: 'recon-cli';
    timestamp: number;
    codebaseDirectory?: string;
    filesAnalyzed?: number;
    applicationDefinition?: {
      purpose?: string;
      features?: string;
      industry?: string;
      systemPrompt?: string;
      hasAccessTo?: string;
      doesNotHaveAccessTo?: string;
      userTypes?: string;
      securityRequirements?: string;
      sensitiveDataTypes?: string;
      exampleIdentifiers?: string;
      criticalActions?: string;
      forbiddenTopics?: string;
      attackConstraints?: string;
      competitors?: string;
      connectedSystems?: string;
      redteamUser?: string;
    };
    reconContext?: {
      stateful?: boolean;
      entities?: string[];
      discoveredTools?: Array<{ name: string; description: string; parameters?: string }>;
      securityNotes?: string[];
      keyFiles?: string[];
      suggestedPlugins?: string[];
    };
  };
  reconResult?: {
    purpose?: string;
    [key: string]: unknown;
  };
}

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
 */
export function usePendingRecon(
  onReconApplied?: (tabIndex: number) => void,
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
    async (data: PendingReconData) => {
      const { config: reconConfig, metadata } = data;

      // Build the full config for the Zustand store
      const stateful = metadata.reconContext?.stateful ?? false;

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
      const meaningfulFields = Object.entries(applicationDefinition).filter(
        ([key, value]) =>
          value &&
          typeof value === 'string' &&
          value.trim() !== '' &&
          !['accessToData', 'forbiddenData', 'accessToActions', 'forbiddenActions'].includes(key),
      ).length;

      const fullConfig: Config = {
        description: reconConfig.description || 'Red Team Configuration (from Recon)',
        prompts: ['{{prompt}}'],
        target,
        plugins: reconConfig.redteam?.plugins || ['default'],
        strategies: reconConfig.redteam?.strategies || ['basic'],
        purpose: reconConfig.redteam?.purpose || '',
        entities:
          reconConfig.redteam?.entities || metadata.reconContext?.entities || [],
        numTests: reconConfig.redteam?.numTests || REDTEAM_DEFAULTS.NUM_TESTS,
        maxConcurrency: REDTEAM_DEFAULTS.MAX_CONCURRENCY,
        applicationDefinition,
      };

      // Create ReconContext for tracking
      const newReconContext: ReconContext = {
        source: 'recon-cli',
        timestamp: metadata.timestamp,
        codebaseDirectory: metadata.codebaseDirectory,
        filesAnalyzed: metadata.filesAnalyzed,
        fieldsPopulated: meaningfulFields,
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
          // No pending config, clean up URL and continue
          setError('No pending recon configuration found');
          navigate('/redteam/setup', { replace: true });
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch pending recon configuration');
        }

        const data: PendingReconData = await response.json();

        // Apply the configuration
        await applyReconConfig(data);

        // Clear the pending file
        await callApi('/redteam/recon/pending', { method: 'DELETE' });

        setReconApplied(true);

        // Clean up URL and navigate to Review tab (index 5)
        navigate('/redteam/setup#5', { replace: true });

        // Notify parent to switch tabs
        if (onReconApplied) {
          onReconApplied(5);
        }
      } catch (err) {
        console.error('Failed to load pending recon config:', err);
        setError(err instanceof Error ? err.message : 'Failed to load recon configuration');
        // Clean up URL even on error
        navigate('/redteam/setup', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    loadPendingRecon();
  }, [searchParams, navigate, applyReconConfig, onReconApplied]);

  return {
    isLoading,
    error,
    reconApplied,
    reconContext,
  };
}
