import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import InfoIcon from '@mui/icons-material/Info';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  riskCategories,
} from '@promptfoo/redteam/constants';
import { Link as RouterLink } from 'react-router-dom';
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

const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'];

const TITLE_BY_TAB: Record<number, string> = {
  0: 'Plugins',
  1: 'Custom Intents',
  2: 'Custom Policies',
};

const DESCRIPTIONS_BY_TAB: Record<number, React.ReactNode> = {
  // plugins:
  0: (
    <Stack spacing={2}>
      <Typography variant="body1">
        Plugins are Promptfoo's modular system for testing a variety of risks and vulnerabilities in
        LLM models and LLM-powered applications. Each plugin is a trained model that produces
        malicious payloads targeting specific weaknesses.{' '}
        <RouterLink
          style={{ textDecoration: 'underline' }}
          to="https://www.promptfoo.dev/docs/red-team/plugins/"
          target="_blank"
        >
          Learn More
        </RouterLink>
      </Typography>

      <Typography variant="body1">
        Select the red-team plugins that align with your security testing objectives.
      </Typography>
    </Stack>
  ),
  // custom intents
  1: (
    <Typography variant="body1">
      <span>
        Intents are seed phrases for attack generation, for example "teach me how to cook meth".
        Promptfoo transforms each intent into a sophisticated attacks using jailbreak strategies.
      </span>{' '}
      <Tooltip
        title={
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Supported file formats:</strong>
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              • <strong>CSV:</strong> First column used, requires header row
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              • <strong>JSON:</strong> Array of strings or nested arrays for multi-step intents
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              <strong>JSON examples:</strong>
            </Typography>
            <Typography variant="body2" component="pre" sx={{ fontSize: '0.7rem', mt: 0.5 }}>
              {`["intent1", "intent2"]
[["step1", "step2"], "single_intent"]`}
            </Typography>
          </Box>
        }
        arrow
        placement="top"
      >
        <IconButton size="small">
          <InfoIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Typography>
  ),
  // custom policies
  2: (
    <Typography variant="body1">
      Custom policies define rules that the AI should follow. These are used to test if the AI
      adheres to your specific guidelines and constraints. You can add policies manually or upload a
      CSV file (first column will be used as policies).
    </Typography>
  ),
};

// TabPanel component for conditional rendering
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  const isHidden = value !== index;
  return (
    <Box
      role="tabpanel"
      hidden={isHidden}
      id={`plugins-tabpanel-${index}`}
      aria-labelledby={`plugins-tab-${index}`}
    >
      {!isHidden && <Box>{children}</Box>}
    </Box>
  );
}

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
  const [activeTab, setActiveTab] = useState<number>(0);

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: number) => {
      setActiveTab(newValue);
      recordEvent('feature_used', {
        feature: 'redteam_config_plugins_tab_changed',
        tab: ['plugins', 'custom_prompts', 'custom_policies'][newValue],
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
  useEffect(() => {
    if (hasUserInteracted) {
      // Get policy and intent plugins from existing config
      const policyPlugins = config.plugins.filter(
        (p) => typeof p === 'object' && p.id === 'policy',
      );
      const intentPlugins = config.plugins.filter(
        (p) => typeof p === 'object' && p.id === 'intent',
      );

      // Convert selected plugins to config format with their configs
      const regularPlugins = Array.from(selectedPlugins).map((plugin) => {
        const existingConfig = pluginConfig[plugin];
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
  }, [selectedPlugins, pluginConfig, hasUserInteracted, config.plugins, updatePlugins]);

  const handlePluginToggle = useCallback(
    (plugin: Plugin) => {
      setHasUserInteracted(true);
      setSelectedPlugins((prev) => {
        const newSet = new Set(prev);

        if (plugin === 'policy') {
          if (newSet.has(plugin)) {
            newSet.delete(plugin);
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

  const updatePluginConfig = useCallback(
    (plugin: string, newConfig: Partial<LocalPluginConfig[string]>) => {
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
  }, [hasAnyPluginsConfigured, isConfigValid, selectedPlugins, pluginConfig]);

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
      description={<Box sx={{ maxWidth: '1200px' }}>{DESCRIPTIONS_BY_TAB[activeTab]}</Box>}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isConfigValid() || !hasAnyPluginsConfigured()}
      warningMessage={
        !isConfigValid() || !hasAnyPluginsConfigured() ? getNextButtonTooltip() : undefined
      }
    >
      {/* Warning banner when remote generation is disabled - outside tabs, full width sticky */}
      {isRemoteGenerationDisabled && (
        <Alert
          severity="warning"
          icon={<WarningAmberIcon />}
          sx={(theme) => ({
            position: 'sticky',
            top: 0,
            zIndex: 10,
            margin: -3,
            marginBottom: 3,
            padding: theme.spacing(2, 3),
            borderRadius: 0,
            boxShadow: `0 2px 4px ${alpha(theme.palette.common.black, 0.1)}`,
            '& .MuiAlert-message': {
              width: '100%',
            },
          })}
        >
          <Box>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              Remote Generation Disabled
            </Typography>
            <Typography variant="body2">
              Some plugins require remote generation and are currently unavailable. These plugins
              include harmful content tests, bias tests, and other advanced security checks. To
              enable them, unset the <code>PROMPTFOO_DISABLE_REMOTE_GENERATION</code> or{' '}
              <code>PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION</code> environment variables.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Warning banner when all/most plugins are selected - outside tabs, full width sticky */}
      {hasSelectedMostPlugins && (
        <Alert
          severity="warning"
          icon={<WarningAmberIcon />}
          sx={(theme) => ({
            position: 'sticky',
            top: 0,
            zIndex: 9,
            margin: -3,
            marginBottom: 3,
            padding: theme.spacing(2, 3),
            borderRadius: 0,
            boxShadow: `0 2px 4px ${alpha(theme.palette.common.black, 0.1)}`,
            '& .MuiAlert-message': {
              width: '100%',
            },
          })}
        >
          <Box>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              Performance Warning: Too Many Plugins Selected
            </Typography>
            <Typography variant="body2">
              Selecting many plugins is usually not efficient and will significantly increase
              evaluation time and cost. It's recommended to use the preset configurations or select
              only the plugins specifically needed for your use case.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Tabs component */}
      <Box sx={{ width: '100%', mb: 3 }}>
        <TestCaseGenerationProvider redTeamConfig={config}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="plugin configuration tabs">
            <Tab
              label={`Plugins (${selectedPlugins.size})`}
              id="plugins-tab-0"
              aria-controls="plugins-tabpanel-0"
            />
            <Tab
              label={`Custom Intents (${customIntentsCount})`}
              id="plugins-tab-1"
              aria-controls="plugins-tabpanel-1"
            />
            <Tab
              label={`Custom Policies (${customPoliciesCount})`}
              id="plugins-tab-2"
              aria-controls="plugins-tabpanel-2"
            />
          </Tabs>
        </TestCaseGenerationProvider>
        <Divider />
      </Box>

      {/* Tab Panel 0: Plugins */}
      <TabPanel value={activeTab} index={0}>
        <PluginsTab
          selectedPlugins={selectedPlugins}
          handlePluginToggle={handlePluginToggle}
          pluginConfig={pluginConfig}
          updatePluginConfig={updatePluginConfig}
          recentlyUsedPlugins={recentlyUsedSnapshot}
          onUserInteraction={() => setHasUserInteracted(true)}
          isRemoteGenerationDisabled={isRemoteGenerationDisabled}
        />
      </TabPanel>

      {/* Tab Panel 1: Custom Prompts */}
      <TabPanel value={activeTab} index={1}>
        <CustomPromptsTab />
      </TabPanel>

      {/* Tab Panel 2: Custom Policies */}
      <TabPanel value={activeTab} index={2}>
        <CustomPoliciesTab />
      </TabPanel>
    </PageWrapper>
  );
}
