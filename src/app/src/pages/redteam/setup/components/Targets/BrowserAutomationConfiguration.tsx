import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

import type { ProviderOptions } from '../../types';

interface BrowserStep {
  action: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'wait' | 'waitForNewChildren';
  args?: {
    url?: string;
    selector?: string;
    text?: string;
    path?: string;
    ms?: number;
    fullPage?: boolean;
    parentSelector?: string;
    delay?: number;
    timeout?: number;
    optional?: boolean;
  };
  name?: string;
}

interface BrowserAutomationConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const BrowserAutomationConfiguration = ({
  selectedTarget,
  updateCustomTarget,
}: BrowserAutomationConfigurationProps) => {
  return (
    <div className="mt-4">
      <h3 className="mb-4 text-lg font-semibold">Browser Automation Configuration</h3>
      <div className="rounded-lg border border-border p-4">
        <p className="mb-4 text-sm text-muted-foreground">
          Configure browser automation steps to interact with web applications. Each step represents
          an action like navigation, clicking, or typing.
        </p>

        <div className="space-y-2">
          <Label htmlFor="headless-mode">Headless Mode</Label>
          <Select
            value={String(selectedTarget.config.headless ?? true)}
            onValueChange={(value) => updateCustomTarget('headless', value === 'true')}
          >
            <SelectTrigger id="headless-mode">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes (Hidden Browser)</SelectItem>
              <SelectItem value="false">No (Visible Browser)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="timeout-ms">Timeout (ms)</Label>
          <Input
            id="timeout-ms"
            type="number"
            value={selectedTarget.config.timeoutMs || 30000}
            onChange={(e) => updateCustomTarget('timeoutMs', Number(e.target.value))}
          />
          <p className="text-sm text-muted-foreground">
            Maximum time to wait for browser operations (in milliseconds)
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="response-transform">Response Transform</Label>
          <Input
            id="response-transform"
            value={selectedTarget.config.transformResponse || ''}
            onChange={(e) => updateCustomTarget('transformResponse', e.target.value)}
            placeholder="e.g., extracted.searchResults"
          />
          <p className="text-sm text-muted-foreground">
            JavaScript expression to parse the extracted data
          </p>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 font-medium">Browser Steps</h4>

          {selectedTarget.config.steps?.map((step: BrowserStep, index: number) => (
            <div key={index} className="mb-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-4">
                <div className="min-w-[200px]">
                  <Label htmlFor={`step-${index}-action`}>Action Type</Label>
                  <Select
                    value={step.action || ''}
                    onValueChange={(value) => {
                      const newSteps = [...(selectedTarget.config.steps || [])];
                      newSteps[index] = {
                        ...step,
                        action: value as BrowserStep['action'],
                      };
                      updateCustomTarget('steps', newSteps);
                    }}
                  >
                    <SelectTrigger id={`step-${index}-action`}>
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="navigate">Navigate</SelectItem>
                      <SelectItem value="click">Click</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                      <SelectItem value="extract">Extract</SelectItem>
                      <SelectItem value="wait">Wait</SelectItem>
                      <SelectItem value="waitForNewChildren">Wait for New Children</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newSteps = selectedTarget.config.steps?.filter(
                      (_: BrowserStep, i: number) => i !== index,
                    );
                    updateCustomTarget('steps', newSteps);
                  }}
                  className="mt-6"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="mt-4">
                {step.action === 'navigate' && (
                  <div className="space-y-2">
                    <Label htmlFor={`step-${index}-url`}>URL</Label>
                    <Input
                      id={`step-${index}-url`}
                      value={step.args?.url || ''}
                      onChange={(e) => {
                        const newSteps = [...(selectedTarget.config.steps || [])];
                        newSteps[index] = {
                          ...step,
                          args: { ...step.args, url: e.target.value },
                        };
                        updateCustomTarget('steps', newSteps);
                      }}
                      placeholder="https://example.com"
                    />
                  </div>
                )}

                {(step.action === 'click' ||
                  step.action === 'type' ||
                  step.action === 'extract') && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`step-${index}-selector`}>Selector</Label>
                      <Input
                        id={`step-${index}-selector`}
                        value={step.args?.selector || ''}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, selector: e.target.value },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                        placeholder="#search-input"
                      />
                    </div>
                    {step.action === 'click' && (
                      <div className="space-y-2">
                        <Label htmlFor={`step-${index}-optional`}>Optional</Label>
                        <Select
                          value={String(step.args?.optional || false)}
                          onValueChange={(value) => {
                            const newSteps = [...(selectedTarget.config.steps || [])];
                            newSteps[index] = {
                              ...step,
                              args: { ...step.args, optional: value === 'true' },
                            };
                            updateCustomTarget('steps', newSteps);
                          }}
                        >
                          <SelectTrigger id={`step-${index}-optional`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {step.action === 'type' && (
                  <div className="mt-4 space-y-2">
                    <Label htmlFor={`step-${index}-text`}>Text</Label>
                    <Input
                      id={`step-${index}-text`}
                      value={step.args?.text || ''}
                      onChange={(e) => {
                        const newSteps = [...(selectedTarget.config.steps || [])];
                        newSteps[index] = {
                          ...step,
                          args: { ...step.args, text: e.target.value },
                        };
                        updateCustomTarget('steps', newSteps);
                      }}
                      placeholder="{{prompt}}"
                    />
                  </div>
                )}

                {step.action === 'wait' && (
                  <div className="space-y-2">
                    <Label htmlFor={`step-${index}-wait-time`}>Wait Time (ms)</Label>
                    <Input
                      id={`step-${index}-wait-time`}
                      type="number"
                      value={step.args?.ms || 1000}
                      onChange={(e) => {
                        const newSteps = [...(selectedTarget.config.steps || [])];
                        newSteps[index] = {
                          ...step,
                          args: { ...step.args, ms: Number(e.target.value) },
                        };
                        updateCustomTarget('steps', newSteps);
                      }}
                    />
                  </div>
                )}

                {step.action === 'extract' && (
                  <div className="mt-4 space-y-2">
                    <Label htmlFor={`step-${index}-var-name`}>Variable Name</Label>
                    <Input
                      id={`step-${index}-var-name`}
                      value={step.name || ''}
                      onChange={(e) => {
                        const newSteps = [...(selectedTarget.config.steps || [])];
                        newSteps[index] = { ...step, name: e.target.value };
                        updateCustomTarget('steps', newSteps);
                      }}
                      placeholder="searchResults"
                    />
                  </div>
                )}

                {step.action === 'waitForNewChildren' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`step-${index}-parent-selector`}>Parent Selector</Label>
                      <Input
                        id={`step-${index}-parent-selector`}
                        value={step.args?.parentSelector || ''}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, parentSelector: e.target.value },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                        placeholder="#results"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`step-${index}-delay`}>Initial Delay (ms)</Label>
                      <Input
                        id={`step-${index}-delay`}
                        type="number"
                        value={step.args?.delay || 1000}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, delay: Number(e.target.value) },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`step-${index}-timeout`}>Timeout (ms)</Label>
                      <Input
                        id={`step-${index}-timeout`}
                        type="number"
                        value={step.args?.timeout || 30000}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, timeout: Number(e.target.value) },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() => {
              const newSteps = [...(selectedTarget.config.steps || []), { action: '', args: {} }];
              updateCustomTarget('steps', newSteps);
            }}
            className="mt-2"
          >
            <Plus className="mr-1 size-4" />
            Add Step
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BrowserAutomationConfiguration;
