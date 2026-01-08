import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Separator } from '@app/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  riskCategories,
} from '@promptfoo/redteam/constants';
import { AlertTriangle, Info } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { PLUGINS_REQUIRING_CONFIG } from '../constants';
import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { countSelectedCustomIntents, countSelectedCustomPolicies } from '../utils/plugins';
import CustomPromptsTab from './CustomIntentsTab';
import CustomPoliciesTab from './CustomPoliciesTab';
import PageWrapper from './PageWrapper';
import PluginsTab from './PluginsTab';
import { TestCaseGenerationProvider } from './TestCaseGenerationProvider';
import type { PluginConfig } from '@promptfoo/redteam/types';

import type { LocalPluginConfig } from '../types';

interface PluginsProps {
  onNext: () => void;
  onBack: () => void;
}

const TITLE_BY_TAB: Record<string, string> = {
  plugins: 'Plugins',
  intents: 'Custom Intents',
  policies: 'Custom Policies',
};

const DESCRIPTIONS_BY_TAB: Record<string, React.ReactNode> = {
  plugins: (
    <div className="space-y-4">
      <p>
        Plugins are Promptfoo's modular system for testing a variety of risks and vulnerabilities in
        LLM models and LLM-powered applications. Each plugin is a trained model that produces
        malicious payloads targeting specific weaknesses.{' '}
        <RouterLink
          className="underline"
          to="https://www.promptfoo.dev/docs/red-team/plugins/"
          target="_blank"
        >
          Learn More
        </RouterLink>
      </p>

      <p>Select the red-team plugins that align with your security testing objectives.</p>
    </div>
  ),
  intents: (
    <p>
      <span>
        Intents are seed phrases for attack generation, for example "teach me how to cook meth".
        Promptfoo transforms each intent into a sophisticated attacks using jailbreak strategies.
      </span>{' '}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-5">
            <Info className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div>
            <p className="mb-1 font-semibold">Supported file formats:</p>
            <p className="mb-0.5">
              • <strong>CSV:</strong> First column used, requires header row
            </p>
            <p className="mb-0.5">
              • <strong>JSON:</strong> Array of strings or nested arrays for multi-step intents
            </p>
            <p className="mt-2 font-semibold">JSON examples:</p>
            <pre className="mt-0.5 text-xs">
              {`["intent1", "intent2"]
[["step1", "step2"], "single_intent"]`}
            </pre>
          </div>
        </TooltipContent>
      </Tooltip>
    </p>
  ),
  policies: (
    <p>
      Custom policies define rules that the AI should follow. These are used to test if the AI
      adheres to your specific guidelines and constraints. You can add policies manually or upload a
      CSV file (first column will be used as policies).
    </p>
  ),
};

export default function Plugins({ onNext, onBack }: PluginsProps) {
  const { config, updatePlugins } = useRedTeamConfig();
  const { plugins: recentlyUsedPlugins, addPlugin } = useRecentlyUsedPlugins();
  const { recordEvent } = useTelemetry();
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();
  const [recentlyUsedSnapshot] = useState<Plugin[]>(() => [...recentlyUsedPlugins]);

  const isRemoteGenerationDisabled = apiHealthStatus === 'disabled';

  const [selectedPlugins, setSelectedPlugins] = useState<Set<Plugin>>(() => {
    return new Set(
      config.plugins
        .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
        .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
    );
  });

  // Tab state management
  const [activeTab, setActiveTab] = useState<string>('plugins');

  const handleTabChange = useCallback(
    (newValue: string) => {
      setActiveTab(newValue);
      recordEvent('feature_used', {
        feature: 'redteam_config_plugins_tab_changed',
        tab: newValue,
      });
    },
    [recordEvent],
  );

  // Track if user has interacted to prevent config updates from overriding user selections
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [pluginConfig, setPluginConfig] = useState<LocalPluginConfig>(() => {
    const initialConfig: LocalPluginConfig = {};
    config.plugins.forEach((plugin) => {
      if (typeof plugin === 'object' && plugin.config) {
        initialConfig[plugin.id] = plugin.config;
      }
    });
    return initialConfig;
  });

  // Ref to track the "authoritative" clean config synchronously
  // This is needed because setPluginConfig is async, and when presets are switched rapidly,
  // the pluginConfig state may not have been updated yet. The ref ensures that once a plugin
  // is deselected, its config is immediately removed and won't be restored on re-selection.
  const cleanPluginConfigRef = useRef<LocalPluginConfig>(
    (() => {
      const initialConfig: LocalPluginConfig = {};
      config.plugins.forEach((plugin) => {
        if (typeof plugin === 'object' && plugin.config) {
          initialConfig[plugin.id] = plugin.config;
        }
      });
      return initialConfig;
    })(),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_plugins' });
  }, []);

  // Sync selectedPlugins from config only on initial load or when user hasn't interacted
  useEffect(() => {
    if (!hasUserInteracted) {
      const configPlugins = new Set(
        config.plugins
          .map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id))
          .filter((id) => id !== 'policy' && id !== 'intent') as Plugin[],
      );

      // Only update if the sets are actually different to avoid unnecessary re-renders
      if (
        configPlugins.size !== selectedPlugins.size ||
        !Array.from(configPlugins).every((plugin) => selectedPlugins.has(plugin))
      ) {
        setSelectedPlugins(configPlugins);
      }
    }
  }, [config.plugins, hasUserInteracted, selectedPlugins]);

  // Sync selectedPlugins to config after user interaction
  // Also cleans up orphaned plugin configs for deselected plugins to ensure bulk operations
  // (presets, Select None, suite deselect) behave consistently with individual toggles
  useEffect(() => {
    if (hasUserInteracted) {
      // Clean up orphaned plugin configs - update ref synchronously to handle rapid preset switches
      // This ensures that once a plugin is deselected, its config won't be restored on re-selection
      const cleanedPluginConfig: LocalPluginConfig = {};
      for (const key of Object.keys(cleanPluginConfigRef.current)) {
        if (selectedPlugins.has(key as Plugin)) {
          cleanedPluginConfig[key] = cleanPluginConfigRef.current[key];
        }
      }
      // Update ref synchronously (this is the key to fixing the race condition)
      cleanPluginConfigRef.current = cleanedPluginConfig;

      // Also update state for consistency with handlers that use state
      setPluginConfig(cleanedPluginConfig);

      // Get policy and intent plugins from existing config
      const policyPlugins = config.plugins.filter(
        (p) => typeof p === 'object' && p.id === 'policy',
      );
      const intentPlugins = config.plugins.filter(
        (p) => typeof p === 'object' && p.id === 'intent',
      );

      // Convert selected plugins to config format with their configs
      // Use cleanedPluginConfig (derived from ref) to ensure deselected plugin configs aren't included
      const regularPlugins = Array.from(selectedPlugins).map((plugin) => {
        const existingConfig = cleanedPluginConfig[plugin];
        if (existingConfig && Object.keys(existingConfig).length > 0) {
          return {
            id: plugin,
            config: existingConfig,
          };
        }
        return plugin;
      });

      // Combine all plugins
      const allPlugins = [...regularPlugins, ...policyPlugins, ...intentPlugins];

      // updatePlugins handles deduplication by comparing merged output vs current state
      updatePlugins(allPlugins as Array<string | { id: string; config: any }>);
    }
  }, [selectedPlugins, hasUserInteracted, config.plugins, updatePlugins]);

  const handlePluginToggle = useCallback(
    (plugin: Plugin) => {
      setHasUserInteracted(true);
      setSelectedPlugins((prev) => {
        const newSet = new Set(prev);

        if (plugin === 'policy') {
          if (newSet.has(plugin)) {
            newSet.delete(plugin);
            // Update both ref and state when removing config
            delete cleanPluginConfigRef.current[plugin];
            setPluginConfig((prevConfig) => {
              const newConfig = { ...prevConfig };
              delete newConfig[plugin];
              return newConfig;
            });
          } else {
            newSet.add(plugin);
          }
          return newSet;
        }

        if (newSet.has(plugin)) {
          newSet.delete(plugin);
          // Update both ref and state when removing config
          delete cleanPluginConfigRef.current[plugin as keyof LocalPluginConfig];
          setPluginConfig((prevConfig) => {
            const newConfig = { ...prevConfig };
            delete newConfig[plugin as keyof LocalPluginConfig];
            return newConfig;
          });
        } else {
          newSet.add(plugin);
          addPlugin(plugin);
        }
        return newSet;
      });
    },
    [addPlugin],
  );

  // Batch update for preset selection - sets all plugins in a single state update
  // This prevents infinite render loops caused by calling handlePluginToggle in a forEach loop
  const handleSetPlugins = useCallback(
    (plugins: Set<Plugin>) => {
      setHasUserInteracted(true);
      setSelectedPlugins(plugins);
      // Only add plugins that aren't already in recentlyUsed to avoid unnecessary updates
      plugins.forEach((plugin) => {
        if (!recentlyUsedSnapshot.includes(plugin)) {
          addPlugin(plugin);
        }
      });
    },
    [addPlugin, recentlyUsedSnapshot],
  );

  const updatePluginConfig = useCallback(
    (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => {
      // Update ref synchronously to keep it in sync
      const currentRefConfig = cleanPluginConfigRef.current[plugin] || {};
      cleanPluginConfigRef.current = {
        ...cleanPluginConfigRef.current,
        [plugin]: {
          ...currentRefConfig,
          ...newConfig,
        },
      };

      setPluginConfig((prevConfig) => {
        const currentConfig = prevConfig[plugin] || {};
        const configChanged = JSON.stringify(currentConfig) !== JSON.stringify(newConfig);

        if (!configChanged) {
          return prevConfig;
        }
        return {
          ...prevConfig,
          [plugin]: {
            ...currentConfig,
            ...newConfig,
          },
        };
      });
    },
    [],
  );

  const isConfigValid = useCallback(() => {
    for (const plugin of selectedPlugins) {
      if (PLUGINS_REQUIRING_CONFIG.includes(plugin)) {
        const config = pluginConfig[plugin];
        if (!config || Object.keys(config).length === 0) {
          return false;
        }
        for (const key in config) {
          const value = config[key as keyof PluginConfig];
          if (Array.isArray(value) && value.length === 0) {
            return false;
          }
          if (typeof value === 'string' && value.trim() === '') {
            return false;
          }
        }
      }
    }
    return true;
  }, [selectedPlugins, pluginConfig]);

  const hasAnyPluginsConfigured = useCallback(() => {
    // Check regular plugins
    if (selectedPlugins.size > 0) {
      return true;
    }

    // Check custom policies with actual content
    const hasPolicies = config.plugins.some(
      (p) =>
        typeof p === 'object' &&
        p.id === 'policy' &&
        p.config?.policy &&
        typeof p.config.policy === 'string' &&
        p.config.policy.trim().length > 0,
    );

    // Check custom intents with actual content
    const hasIntents = config.plugins.some(
      (p) =>
        typeof p === 'object' &&
        p.id === 'intent' &&
        p.config?.intent &&
        Array.isArray(p.config.intent) &&
        p.config.intent.length > 0,
    );

    return hasPolicies || hasIntents;
  }, [selectedPlugins, config.plugins]);

  const isPluginConfigured = useCallback(
    (plugin: Plugin) => {
      if (!PLUGINS_REQUIRING_CONFIG.includes(plugin) || plugin === 'policy') {
        return true;
      }
      const config = pluginConfig[plugin];
      if (!config || Object.keys(config).length === 0) {
        return false;
      }

      for (const key in config) {
        const value = config[key as keyof PluginConfig];
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
        if (typeof value === 'string' && value.trim() === '') {
          return false;
        }
      }
      return true;
    },
    [pluginConfig],
  );

  const getNextButtonTooltip = useCallback(() => {
    if (!hasAnyPluginsConfigured()) {
      return 'Select at least one plugin';
    }

    if (!isConfigValid()) {
      const missingConfigPlugins = Array.from(selectedPlugins).filter(
        (plugin) => PLUGINS_REQUIRING_CONFIG.includes(plugin) && !isPluginConfigured(plugin),
      );

      if (missingConfigPlugins.length === 1) {
        const pluginName =
          displayNameOverrides[missingConfigPlugins[0]] ||
          categoryAliases[missingConfigPlugins[0]] ||
          missingConfigPlugins[0];
        return `Click the settings button (⚙️) to configure ${pluginName}`;
      } else if (missingConfigPlugins.length > 1) {
        const pluginNames = missingConfigPlugins
          .map((plugin) => displayNameOverrides[plugin] || categoryAliases[plugin] || plugin)
          .join(', ');
        return `Click the settings buttons (⚙️) to configure: ${pluginNames}`;
      }
    }

    return '';
  }, [hasAnyPluginsConfigured, isConfigValid, selectedPlugins, isPluginConfigured]);

  // Check if user has selected all or most plugins
  const hasSelectedMostPlugins = useMemo(() => {
    // Get all unique plugins from risk categories (excluding intent and policy)
    const allAvailablePlugins = new Set<Plugin>();
    Object.values(riskCategories).forEach((plugins) => {
      plugins.forEach((plugin) => {
        if (plugin !== 'intent' && plugin !== 'policy') {
          allAvailablePlugins.add(plugin);
        }
      });
    });

    const totalAvailable = allAvailablePlugins.size;
    const totalSelected = selectedPlugins.size;
    // Show warning if more than 80% of plugins are selected or all plugins are selected
    return totalSelected >= totalAvailable * 0.8 || totalSelected === totalAvailable;
  }, [selectedPlugins]);

  const customIntentsCount = countSelectedCustomIntents(config);
  const customPoliciesCount = countSelectedCustomPolicies(config);

  return (
    <PageWrapper
      title={TITLE_BY_TAB[activeTab]}
      description={<div className="max-w-[1200px]">{DESCRIPTIONS_BY_TAB[activeTab]}</div>}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isConfigValid() || !hasAnyPluginsConfigured()}
      warningMessage={
        !isConfigValid() || !hasAnyPluginsConfigured() ? getNextButtonTooltip() : undefined
      }
    >
      {/* Warning banner when remote generation is disabled */}
      {isRemoteGenerationDisabled && (
        <Alert variant="warning" className="sticky top-0 z-10 -mx-3 mb-3 rounded-none shadow-sm">
          <AlertTriangle className="size-4" />
          <AlertTitle>Remote Generation Disabled</AlertTitle>
          <AlertDescription>
            Some plugins require remote generation and are currently unavailable. These plugins
            include harmful content tests, bias tests, and other advanced security checks. To enable
            them, unset the <code>PROMPTFOO_DISABLE_REMOTE_GENERATION</code> or{' '}
            <code>PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION</code> environment variables.
          </AlertDescription>
        </Alert>
      )}

      {/* Warning banner when all/most plugins are selected */}
      {hasSelectedMostPlugins && (
        <Alert variant="warning" className="sticky top-0 z-[9] -mx-3 mb-3 rounded-none shadow-sm">
          <AlertTriangle className="size-4" />
          <AlertTitle>Performance Warning: Too Many Plugins Selected</AlertTitle>
          <AlertDescription>
            Selecting many plugins is usually not efficient and will significantly increase
            evaluation time and cost. It's recommended to use the preset configurations or select
            only the plugins specifically needed for your use case.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs component */}
      <div className="mb-6 w-full">
        <TestCaseGenerationProvider redTeamConfig={config}>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="plugins">Plugins ({selectedPlugins.size})</TabsTrigger>
              <TabsTrigger value="intents">Custom Intents ({customIntentsCount})</TabsTrigger>
              <TabsTrigger value="policies">Custom Policies ({customPoliciesCount})</TabsTrigger>
            </TabsList>
            <Separator className="mt-2" />

            <TabsContent value="plugins" className="mt-4">
              <PluginsTab
                selectedPlugins={selectedPlugins}
                handlePluginToggle={handlePluginToggle}
                setSelectedPlugins={handleSetPlugins}
                pluginConfig={pluginConfig}
                updatePluginConfig={updatePluginConfig}
                recentlyUsedPlugins={recentlyUsedSnapshot}
                onUserInteraction={() => setHasUserInteracted(true)}
                isRemoteGenerationDisabled={isRemoteGenerationDisabled}
              />
            </TabsContent>

            <TabsContent value="intents" className="mt-4">
              <CustomPromptsTab />
            </TabsContent>

            <TabsContent value="policies" className="mt-4">
              <CustomPoliciesTab />
            </TabsContent>
          </Tabs>
        </TestCaseGenerationProvider>
      </div>
    </PageWrapper>
  );
}
