import { useEffect, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { Minus, Plus } from 'lucide-react';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import type { Plugin } from '@promptfoo/redteam/constants';
import type { PluginConfig } from '@promptfoo/redteam/types';

import type { LocalPluginConfig } from '../types';

interface PluginConfigDialogProps {
  open: boolean;
  plugin: Plugin | null;
  config: LocalPluginConfig[string];
  onClose: () => void;
  onSave: (plugin: Plugin, config: LocalPluginConfig[string]) => void;
}

export default function PluginConfigDialog({
  open,
  plugin,
  config,
  onClose,
  onSave,
}: PluginConfigDialogProps) {
  const { config: redTeamConfig } = useRedTeamConfig();
  // Initialize with provided config
  const [localConfig, setLocalConfig] = useState<LocalPluginConfig[string]>(config);

  // Update localConfig when config prop changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (open && plugin && (!localConfig || Object.keys(localConfig).length === 0)) {
      setLocalConfig(config || {});
    }
  }, [open, plugin, config]);

  const handleArrayInputChange = (key: string, index: number, value: string) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key as keyof PluginConfig])
        ? [...(prev[key as keyof PluginConfig] as string[])]
        : [''];
      currentArray[index] = value;
      return {
        ...prev,
        [key]: currentArray,
      };
    });
  };

  const addArrayItem = (key: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      [key]: [
        ...(Array.isArray(prev[key as keyof PluginConfig])
          ? (prev[key as keyof PluginConfig] as string[])
          : []),
        '',
      ],
    }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setLocalConfig((prev) => {
      const currentArray = Array.isArray(prev[key as keyof PluginConfig])
        ? [...(prev[key as keyof PluginConfig] as string[])]
        : [''];
      currentArray.splice(index, 1);
      if (currentArray.length === 0) {
        currentArray.push('');
      }
      return {
        ...prev,
        [key]: currentArray,
      };
    });
  };

  const hasEmptyArrayItems = (array: string[] | undefined) => {
    return array?.some((item) => item.trim() === '') ?? false;
  };

  const renderConfigInputs = () => {
    if (!plugin) {
      return null;
    }

    let specificConfig;

    switch (plugin) {
      case 'policy':
        // Show read-only list of all configured policies
        const policyPlugins = redTeamConfig.plugins.filter(
          (p): p is { id: string; config: PluginConfig } =>
            typeof p === 'object' && 'id' in p && p.id === 'policy',
        );

        if (policyPlugins.length === 0) {
          specificConfig = (
            <p className="py-4 text-sm text-muted-foreground">
              No custom policies configured. Add policies in the Custom Policies section.
            </p>
          );
        } else {
          specificConfig = (
            <div>
              <p className="mb-3 text-sm font-medium">
                Configured Custom Policies ({policyPlugins.length})
              </p>
              {policyPlugins.map((policyPlugin, index) => (
                <div key={index} className="mb-3 rounded-md border border-border bg-muted/30 p-3">
                  <p className="mb-1 text-xs text-muted-foreground">Policy {index + 1}</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {typeof policyPlugin.config.policy === 'string'
                      ? policyPlugin.config.policy
                      : policyPlugin.config.policy?.text || 'No policy text'}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                To edit or add policies, use the Custom Policies section in Available Plugins.
              </p>
            </div>
          );
        }
        break;
      case 'intent':
        // Show read-only list of all configured custom intents
        const intentPlugin = redTeamConfig.plugins.find(
          (p): p is { id: string; config: PluginConfig } =>
            typeof p === 'object' && 'id' in p && p.id === 'intent',
        );

        if (!intentPlugin?.config?.intent) {
          specificConfig = (
            <p className="py-4 text-sm text-muted-foreground">
              No custom intents configured. Add intents in the Custom Prompts section.
            </p>
          );
          break;
        }

        const intents = intentPlugin.config.intent;
        const flatIntents = (Array.isArray(intents) ? intents.flat() : [intents]).filter(
          (intent: unknown) => typeof intent === 'string' && intent.trim(),
        );

        if (flatIntents.length === 0) {
          specificConfig = (
            <p className="py-4 text-sm text-muted-foreground">
              No custom intents configured. Add intents in the Custom Prompts section.
            </p>
          );
          break;
        }

        specificConfig = (
          <div>
            <p className="mb-3 text-sm font-medium">
              Configured Custom Intents ({flatIntents.length})
            </p>
            {flatIntents.map((intent: string, index: number) => (
              <div key={index} className="mb-3 rounded-md border border-border bg-muted/30 p-3">
                <p className="mb-1 text-xs text-muted-foreground">Intent {index + 1}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{intent}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              To edit or add intents, use the Custom Prompts section in Available Plugins.
            </p>
          </div>
        );
        break;
      case 'prompt-extraction':
        const key = 'systemPrompt';
        specificConfig = (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The Prompt Extraction plugin tests whether an attacker can extract your system prompt
              through various techniques. Provide your actual system prompt here so the plugin can
              test if it can be extracted.
            </p>
            <div className="space-y-2">
              <Label htmlFor="system-prompt">System Prompt</Label>
              <Textarea
                id="system-prompt"
                className="min-h-[100px]"
                value={(localConfig[key] as string) || ''}
                onChange={(e) => setLocalConfig({ ...localConfig, [key]: e.target.value })}
              />
            </div>
          </div>
        );
        break;
      case 'bfla':
      case 'bola':
      case 'ssrf':
        const arrayKey =
          plugin === 'bfla'
            ? 'targetIdentifiers'
            : plugin === 'bola'
              ? 'targetSystems'
              : 'targetUrls';

        const getExplanation = () => {
          switch (plugin) {
            case 'bfla':
              return "BFLA (Broken Function Level Authorization) tests whether users can access functions they shouldn't. Specify function names, API endpoints, or identifiers that should have restricted access.";
            case 'bola':
              return "BOLA (Broken Object Level Authorization) tests whether users can access objects they shouldn't own. Specify system names, object IDs, or resource identifiers to test authorization controls.";
            case 'ssrf':
              return 'SSRF (Server-Side Request Forgery) tests whether your application can be tricked into making requests to unintended destinations. Specify URLs or endpoints that should not be accessible.';
            default:
              return '';
          }
        };

        // Ensure we always have at least one item
        const currentArray = (localConfig[arrayKey] as string[]) || [''];
        specificConfig = (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{getExplanation()}</p>
            {currentArray.map((item: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={item}
                  onChange={(e) => handleArrayInputChange(arrayKey, index, e.target.value)}
                  placeholder={`${arrayKeyToLabel(arrayKey)} ${index + 1}`}
                />
                {/* Only show remove button if there's more than one item */}
                {currentArray.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeArrayItem(arrayKey, index)}
                  >
                    <Minus className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => addArrayItem(arrayKey)}
              disabled={hasEmptyArrayItems(currentArray)}
            >
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          </div>
        );
        break;
      case 'indirect-prompt-injection':
        specificConfig = (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Indirect Prompt Injection tests whether untrusted content can influence your AI
              system's behavior. This happens when user-generated content or external data (like
              from RAG systems) contains malicious instructions. Specify the variable name in your
              prompt that contains untrusted data (e.g., 'name', 'userContent', 'document').
            </p>
            <div className="space-y-2">
              <Label htmlFor="indirect-injection-var">Indirect Injection Variable</Label>
              <Input
                id="indirect-injection-var"
                value={(localConfig.indirectInjectionVar as string) || ''}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, indirectInjectionVar: e.target.value })
                }
                placeholder="e.g., name, userContent, document"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {`Example: If your prompt is "Hello {{name}}, how can I help?" and user data goes into the 'name' variable, enter "name" above.`}
            </p>
          </div>
        );
        break;
      default:
        specificConfig = null;
    }

    return (
      <>
        {specificConfig}

        {/* Grading Guidance - available for all plugins */}
        {specificConfig && <div className="my-4" />}
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">Grading Guidance (Optional)</p>
            <p className="mb-3 text-sm text-muted-foreground">
              Plugin-specific rules that take priority over general grading criteria
            </p>
          </div>
          <Textarea
            id="plugin-grading-guidance-input"
            className="min-h-[100px]"
            placeholder="e.g., For this financial app, discussing fund names is required and should pass."
            value={(localConfig.graderGuidance as string) || ''}
            onChange={(e) =>
              setLocalConfig((prev) => ({ ...prev, graderGuidance: e.target.value }))
            }
          />
        </div>
      </>
    );
  };

  const handleSave = () => {
    if (plugin && localConfig) {
      const configToSave = { ...localConfig };

      // Remove empty graderGuidance
      if (!configToSave.graderGuidance || (configToSave.graderGuidance as string).trim() === '') {
        delete configToSave.graderGuidance;
      }

      if (JSON.stringify(config) !== JSON.stringify(configToSave)) {
        onSave(plugin, configToSave);
      }
      onClose();
    }
  };

  const isReadOnlyPlugin = plugin === 'policy' || plugin === 'intent';

  const getDialogTitle = () => {
    if (plugin === 'policy') {
      return 'View Custom Policies';
    }
    if (plugin === 'intent') {
      return 'View Custom Intents';
    }
    return `Configure ${plugin}`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>
        <div className="py-4">{renderConfigInputs()}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isReadOnlyPlugin ? 'Close' : 'Cancel'}
          </Button>
          {!isReadOnlyPlugin && <Button onClick={handleSave}>Save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const arrayKeyToLabel = (key: string) => {
  switch (key) {
    case 'targetIdentifiers':
      return 'Target Identifier';
    case 'targetSystems':
      return 'Target System';
    case 'targetUrls':
      return 'Target URL';
  }
};
