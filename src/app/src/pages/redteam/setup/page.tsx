import React, { useEffect, useMemo, useRef, useState } from 'react';

import ErrorBoundary from '@app/components/ErrorBoundary';
import PylonChat from '@app/components/PylonChat';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { UserProvider } from '@app/contexts/UserContext';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { ProviderOptionsSchema } from '@promptfoo/validators/providers';
import yaml from 'js-yaml';
import {
  Brain,
  ClipboardCheck,
  Crosshair,
  Download,
  FolderOpen,
  LayoutGrid,
  Puzzle,
  RotateCcw,
  Save,
  Settings,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { customTargetOption, predefinedTargets } from './components/constants';
import Plugins from './components/Plugins';
import Purpose from './components/Purpose';
import Review from './components/Review';
import Setup from './components/Setup';
import Strategies from './components/Strategies';
import TargetConfiguration from './components/Targets/TargetConfiguration';
import TargetTypeSelection from './components/Targets/TargetTypeSelection';
import { TestCaseGenerationProvider } from './components/TestCaseGenerationProvider';
import { NAVBAR_HEIGHT, SIDEBAR_WIDTH } from './constants';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useSetupState } from './hooks/useSetupState';
import { purposeToApplicationDefinition } from './utils/purposeParser';
import { generateOrderedYaml } from './utils/yamlHelpers';
import type { RedteamStrategy } from '@promptfoo/types';

import type { Config, RedteamUITarget } from './types';

// Re-export for backward compatibility
export { SIDEBAR_WIDTH };

interface SavedConfig {
  id: string;
  name: string;
  updatedAt: string;
}

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const TAB_CONFIG = [
  { value: '0', label: 'Target Type', icon: Crosshair },
  { value: '1', label: 'Target Config', icon: Settings },
  { value: '2', label: 'Application Details', icon: LayoutGrid },
  { value: '3', label: 'Plugins', icon: Puzzle, showCount: true, countKey: 'plugins' as const },
  {
    value: '4',
    label: 'Strategies',
    icon: Brain,
    showCount: true,
    countKey: 'strategies' as const,
  },
  { value: '5', label: 'Review', icon: ClipboardCheck },
];

export default function RedTeamSetupPage() {
  usePageMeta({ title: 'Red team setup', description: 'Configure red team testing' });
  const location = useLocation();
  const navigate = useNavigate();
  const { recordEvent } = useTelemetry();

  // Get initial tab from URL hash or default to first page
  const [value, setValue] = useState(() => {
    const hash = location.hash.replace('#', '');
    return hash ? Number.parseInt(hash, 10) : 0;
  });

  const { hasSeenSetup, markSetupAsSeen } = useSetupState();
  const [setupModalOpen, setSetupModalOpen] = useState(!hasSeenSetup);
  const { config, setFullConfig, resetConfig } = useRedTeamConfig();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [configName, setConfigName] = useState('');
  const toast = useToast();

  // Add new state:
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Add new state for tracking the config date
  const [configDate, setConfigDate] = useState<string | null>(null);

  const lastSavedConfig = useRef<string>('');

  // Track funnel on initial load
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    recordEvent('funnel', {
      type: 'redteam',
      step: 'webui_setup_started',
      source: 'webui',
    });
  }, []);

  const navigateToPlugins = () => {
    setValue(3);
    updateHash(3);
  };

  const navigateToPurpose = () => {
    setValue(2);
    updateHash(2);
  };

  const navigateToStrategies = () => {
    setValue(4);
    updateHash(4);
  };

  // Handle browser back/forward
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) {
      const newValue = Number.parseInt(hash, 10);
      if (!Number.isNaN(newValue) && newValue >= 0 && newValue <= 5) {
        setValue(newValue);
      } else {
        setValue(0);
      }
    } else {
      setValue(0);
    }
  }, [location.hash]);

  const updateHash = (newValue: number) => {
    if (location.hash !== `#${newValue}`) {
      navigate(`#${newValue}`);
    }
  };

  const handleNext = () => {
    setValue((prevValue) => {
      const newValue = prevValue + 1;
      updateHash(newValue);
      window.scrollTo({ top: 0 });
      return newValue;
    });
  };

  const handleBack = () => {
    setValue((prevValue) => {
      const newValue = prevValue - 1;
      updateHash(newValue);
      window.scrollTo({ top: 0 });
      return newValue;
    });
  };

  const handleTabChange = (newValue: string) => {
    const numValue = Number.parseInt(newValue, 10);
    updateHash(numValue);
    setValue(numValue);
    window.scrollTo({ top: 0 });

    // Track funnel progress
    const steps = ['target_type', 'target_config', 'purpose', 'plugins', 'strategies', 'review'];
    if (numValue < steps.length) {
      recordEvent('funnel', {
        type: 'redteam',
        step: `webui_setup_${steps[numValue]}_viewed`,
        source: 'webui',
      });
    }
  };

  const closeSetupModal = () => {
    setSetupModalOpen(false);
    markSetupAsSeen();
  };

  const handleSaveConfig = async () => {
    recordEvent('feature_used', {
      feature: 'redteam_config_save',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });

    // Track funnel milestone
    recordEvent('funnel', {
      type: 'redteam',
      step: 'webui_setup_configured',
      source: 'webui',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });

    try {
      const response = await callApi('/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: configName,
          type: 'redteam',
          config,
        }),
      });
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast.showToast('Configuration saved successfully', 'success');
      setSaveDialogOpen(false);
      lastSavedConfig.current = JSON.stringify(config);
      setHasUnsavedChanges(false);
      setConfigName(configName);
      setConfigDate(data.createdAt);
    } catch (error) {
      console.error('Failed to save configuration', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to save configuration',
        'error',
      );
    }

    setHasUnsavedChanges(false);
  };

  const loadConfigs = async () => {
    recordEvent('feature_used', { feature: 'redteam_config_load' });
    try {
      const response = await callApi('/configs?type=redteam');
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setHasUnsavedChanges(false);

      setSavedConfigs(
        data.configs.sort(
          (a: SavedConfig, b: SavedConfig) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      );
    } catch (error) {
      console.error('Failed to load configurations', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to load configurations',
        'error',
      );
      setSavedConfigs([]);
    }
  };

  const handleLoadConfig = async (id: string) => {
    try {
      const response = await callApi(`/configs/redteam/${id}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setFullConfig(data.config);
      setConfigName(data.name);
      setConfigDate(data.updatedAt);
      lastSavedConfig.current = JSON.stringify(data.config);
      setHasUnsavedChanges(false);

      toast.showToast('Configuration loaded successfully', 'success');
      setLoadDialogOpen(false);
      // Faizan: This is a hack to reload the page and apply the new config, this needs to be fixed so a reload isn't required.
      window.location.reload();
    } catch (error) {
      console.error('Failed to load configuration', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to load configuration',
        'error',
      );
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await readFileAsText(file);
      // biome-ignore lint/suspicious/noExplicitAny: FIXME
      const yamlConfig = yaml.load(content) as any;

      const strategies = yamlConfig?.redteam?.strategies || [];
      let target = yamlConfig.targets?.[0] || yamlConfig.providers?.[0] || DEFAULT_HTTP_TARGET;

      // Convert string targets to objects
      if (typeof target === 'string') {
        const targetType = predefinedTargets.find((t: RedteamUITarget) => t.value === target);

        target = ProviderOptionsSchema.parse({
          id: targetType ? targetType.value : customTargetOption.value,
          label: target,
        });
      }

      const hasAnyStatefulStrategies = strategies.some(
        (strat: RedteamStrategy) => typeof strat !== 'string' && strat?.config?.stateful,
      );
      console.log({ hasAnyStatefulStrategies, strategies });
      if (hasAnyStatefulStrategies) {
        if (typeof target === 'string') {
          target = { id: target, config: { stateful: true } };
        } else {
          target.config = { ...target.config, stateful: true };
        }
      }

      // Parse applicationDefinition from purpose string or use explicit definition if available
      // Priority: 1) explicit applicationDefinition in YAML, 2) parse from purpose string, 3) empty defaults
      const applicationDefinition = yamlConfig.redteam?.applicationDefinition
        ? yamlConfig.redteam.applicationDefinition
        : purposeToApplicationDefinition(yamlConfig.redteam?.purpose);

      // Map the YAML structure to our expected Config format
      const mappedConfig: Config = {
        description: yamlConfig.description || 'My Red Team Configuration',
        prompts: yamlConfig.prompts || ['{{prompt}}'],
        target,
        plugins: yamlConfig.redteam?.plugins || ['default'],
        strategies,
        purpose: yamlConfig.redteam?.purpose || '',
        entities: yamlConfig.redteam?.entities || [],
        numTests: yamlConfig.redteam?.numTests || REDTEAM_DEFAULTS.NUM_TESTS,
        maxConcurrency: yamlConfig.redteam?.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY,
        applicationDefinition,
        testGenerationInstructions: yamlConfig.redteam?.testGenerationInstructions || '',
        language: yamlConfig.redteam?.language,
        extensions: yamlConfig.extensions,
      };

      setFullConfig(mappedConfig);
      toast.showToast('Configuration loaded successfully', 'success');
      setLoadDialogOpen(false);
    } catch (error) {
      console.error('Failed to load configuration file', error);
      toast.showToast(
        error instanceof Error ? error.message : 'Failed to load configuration file',
        'error',
      );
    }

    // Reset the input
    event.target.value = '';
  };

  // Replace the existing effect with this one
  useEffect(() => {
    if (!configName) {
      setHasUnsavedChanges(false);
      return;
    }

    const currentConfigString = JSON.stringify(config);
    const hasChanges = lastSavedConfig.current !== currentConfigString;
    setHasUnsavedChanges(hasChanges);
  }, [config, configName]);

  // Update handleResetConfig
  const handleResetConfig = () => {
    resetConfig();
    setConfigName('');
    lastSavedConfig.current = '';
    setHasUnsavedChanges(false);
    setResetDialogOpen(false);
    toast.showToast('Configuration reset to defaults', 'success');
  };

  const handleDownloadYaml = () => {
    const yamlContent = generateOrderedYaml(config);
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${configName || 'redteam-config'}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
    recordEvent('feature_used', {
      feature: 'redteam_config_download',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });
  };

  // Calculate active strategy count (excluding 'basic' with enabled: false)
  const activeStrategyCount = useMemo(() => {
    return config.strategies.filter((strategy) => {
      const id = typeof strategy === 'string' ? strategy : strategy.id;
      // Skip 'basic' strategy if it has enabled: false
      if (id === 'basic' && typeof strategy === 'object' && strategy.config?.enabled === false) {
        return false;
      }
      return true;
    }).length;
  }, [config.strategies]);

  const getTabLabel = (tab: (typeof TAB_CONFIG)[number]) => {
    if (!tab.showCount) {
      return tab.label;
    }
    if (tab.countKey === 'plugins' && config.plugins?.length) {
      return `${tab.label} (${config.plugins.length})`;
    }
    if (tab.countKey === 'strategies' && activeStrategyCount) {
      return `${tab.label} (${activeStrategyCount})`;
    }
    return tab.label;
  };

  return (
    <UserProvider>
      {/* Root container */}
      <div className="fixed flex w-full bg-white dark:bg-zinc-900">
        {/* Content wrapper */}
        <div className="flex grow transition-[margin] duration-200">
          {/* Outer sidebar container */}
          <div
            className="flex h-full flex-col border-r border-border"
            style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
          >
            {/* Inner sidebar (sticky) */}
            <div
              className="sticky flex flex-col"
              style={{
                top: `calc(${NAVBAR_HEIGHT}px + var(--update-banner-height, 0px))`,
                height: `calc(100vh - ${NAVBAR_HEIGHT}px - var(--update-banner-height, 0px))`,
              }}
            >
              {/* Status section */}
              <div
                className="border-b border-r border-border bg-card p-4"
                style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
              >
                <p className="mb-1 text-base font-medium text-foreground">
                  {configName ? `Config: ${configName}` : 'New Configuration'}
                </p>
                {hasUnsavedChanges ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-500">
                      <span>●</span> Unsaved changes
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-w-0 border-amber-500 px-2 py-1 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-950/30"
                      onClick={handleSaveConfig}
                      disabled={!configName}
                    >
                      Save now
                    </Button>
                  </div>
                ) : (
                  configDate && (
                    <p className="text-sm text-muted-foreground">
                      {formatDataGridDate(configDate)}
                    </p>
                  )
                )}
              </div>

              {/* Tabs container */}
              <div className="grow overflow-y-auto">
                <Tabs
                  value={String(value)}
                  onValueChange={handleTabChange}
                  orientation="vertical"
                  className="w-full"
                >
                  <TabsList className="flex h-auto w-full flex-col rounded-none bg-card p-0">
                    {TAB_CONFIG.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          className={cn(
                            'w-full justify-start gap-2 rounded-none border-b border-border px-4 py-3 text-sm font-normal',
                            'data-[state=active]:bg-accent data-[state=active]:shadow-none',
                            'hover:bg-muted/50',
                          )}
                        >
                          <Icon className="size-[18px]" />
                          {getTabLabel(tab)}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              </div>

              {/* Sidebar buttons */}
              <div className="flex flex-col gap-1 border-t border-border bg-card p-3">
                <Button
                  variant="ghost"
                  className="justify-start p-2 text-sm font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setSaveDialogOpen(true)}
                >
                  <Save className="mr-2 size-[18px]" />
                  Save Config
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start p-2 text-sm font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    loadConfigs();
                    setLoadDialogOpen(true);
                  }}
                >
                  <FolderOpen className="mr-2 size-[18px]" />
                  Load Config
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start p-2 text-sm font-normal text-muted-foreground hover:text-foreground"
                  onClick={() => setResetDialogOpen(true)}
                >
                  <RotateCcw className="mr-2 size-[18px]" />
                  Reset Config
                </Button>
              </div>
            </div>
          </div>

          {/* Tab content */}
          <div className="relative flex grow flex-col transition-[margin] duration-200">
            {value === 0 && (
              <ErrorBoundary name="Target Type Selection Page">
                <TargetTypeSelection onNext={handleNext} />
              </ErrorBoundary>
            )}
            {value === 1 && (
              <ErrorBoundary name="Target Configuration Page">
                <TargetConfiguration onNext={handleNext} onBack={handleBack} />
              </ErrorBoundary>
            )}
            {value === 2 && (
              <ErrorBoundary name="Application Purpose Page">
                <Purpose onNext={handleNext} onBack={handleBack} />
              </ErrorBoundary>
            )}
            {value === 3 && (
              <ErrorBoundary name="Plugins Page">
                <TestCaseGenerationProvider redTeamConfig={config}>
                  <Plugins onNext={handleNext} onBack={handleBack} />
                </TestCaseGenerationProvider>
              </ErrorBoundary>
            )}
            {value === 4 && (
              <ErrorBoundary name="Strategies Page">
                <Strategies onNext={handleNext} onBack={handleBack} />
              </ErrorBoundary>
            )}
            {value === 5 && (
              <ErrorBoundary name="Review Page">
                <Review
                  navigateToPlugins={navigateToPlugins}
                  navigateToStrategies={navigateToStrategies}
                  navigateToPurpose={navigateToPurpose}
                />
              </ErrorBoundary>
            )}
          </div>
        </div>

        {setupModalOpen ? <Setup open={setupModalOpen} onClose={closeSetupModal} /> : null}
        <PylonChat />

        {/* Save Dialog */}
        <Dialog open={saveDialogOpen} onOpenChange={(open) => !open && setSaveDialogOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Save Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="config-name">Configuration Name</Label>
                <Input
                  id="config-name"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder="Enter configuration name"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleDownloadYaml} className="flex-1">
                  <Download className="mr-2 size-4" />
                  Export YAML
                </Button>
                <Button onClick={handleSaveConfig} disabled={!configName} className="flex-1">
                  <Save className="mr-2 size-4" />
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Load Dialog */}
        <Dialog open={loadDialogOpen} onOpenChange={(open) => !open && setLoadDialogOpen(false)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Load or Import Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Import YAML Section */}
              <div>
                <p className="text-sm font-medium">Import YAML File</p>
                <p className="mb-2 text-sm text-muted-foreground">
                  Import an existing promptfoo redteam YAML configuration. Your application details
                  will be automatically parsed and pre-filled in the form.
                </p>
                <input
                  accept=".yml,.yaml"
                  className="hidden"
                  id="yaml-file-upload"
                  type="file"
                  onChange={handleFileUpload}
                />
                <label htmlFor="yaml-file-upload">
                  <Button variant="outline" className="w-full" asChild>
                    <span>Import YAML File</span>
                  </Button>
                </label>
              </div>

              <p className="text-sm font-medium">Or choose a saved configuration:</p>

              {savedConfigs.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">No saved configurations found</p>
                </div>
              ) : (
                <div className="max-h-[50vh] space-y-1 overflow-y-auto">
                  {savedConfigs.map((savedConfig) => (
                    <button
                      key={savedConfig.id}
                      onClick={() => handleLoadConfig(savedConfig.id)}
                      className="w-full rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
                    >
                      <p className="font-medium">{savedConfig.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDataGridDate(savedConfig.updatedAt)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLoadDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Dialog */}
        <Dialog open={resetDialogOpen} onOpenChange={(open) => !open && setResetDialogOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Configuration</DialogTitle>
              <DialogDescription>
                Are you sure you want to reset the configuration to default values? This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleResetConfig}>
                Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </UserProvider>
  );
}
