import { useId } from 'react';

import { Button } from '@app/components/ui/button';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

import type { ProviderOptions } from '../../types';

interface BrowserStep {
  action: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'wait' | 'waitForNewChildren';
  args?: {
    url?: string;
    selector?: string;
    text?: string;
    script?: string;
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
  fieldErrors?: BrowserAutomationFieldErrors;
}

export interface BrowserStepFieldErrors {
  action?: string;
  name?: string;
  parentSelector?: string;
  path?: string;
  selector?: string;
  text?: string;
  url?: string;
}

export interface BrowserAutomationFieldErrors {
  steps?: string;
  stepErrors?: Record<number, BrowserStepFieldErrors>;
}

function BrowserFieldError({ id, error }: { id: string; error?: string }) {
  if (!error) {
    return null;
  }

  return (
    <HelperText id={id} error role="alert">
      {error}
    </HelperText>
  );
}

const BrowserAutomationConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  fieldErrors = {},
}: BrowserAutomationConfigurationProps) => {
  const fieldErrorIdPrefix = useId();
  const headlessModeHelpId = `${fieldErrorIdPrefix}-headless-mode-help`;
  const timeoutHelpId = `${fieldErrorIdPrefix}-timeout-help`;
  const responseTransformHelpId = `${fieldErrorIdPrefix}-response-transform-help`;
  const stepsErrorId = `${fieldErrorIdPrefix}-steps`;
  const getStepError = (index: number, field: keyof BrowserStepFieldErrors) =>
    fieldErrors.stepErrors?.[index]?.[field];
  const getStepErrorId = (index: number, field: keyof BrowserStepFieldErrors) =>
    `${fieldErrorIdPrefix}-step-${index}-${field}`;
  const getStepErrorProps = (index: number, field: keyof BrowserStepFieldErrors) => {
    const error = getStepError(index, field);

    return {
      'aria-invalid': Boolean(error),
      'aria-describedby': error ? getStepErrorId(index, field) : undefined,
    };
  };

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
            <SelectTrigger id="headless-mode" aria-describedby={headlessModeHelpId}>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes (Hidden Browser)</SelectItem>
              <SelectItem value="false">No (Visible Browser)</SelectItem>
            </SelectContent>
          </Select>
          <p id={headlessModeHelpId} className="text-sm text-muted-foreground">
            Use a hidden browser for evaluation runs. Choose a visible browser when debugging steps
            locally.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="timeout-ms">Timeout (ms)</Label>
          <Input
            id="timeout-ms"
            type="number"
            value={selectedTarget.config.timeoutMs || 30000}
            onChange={(e) => updateCustomTarget('timeoutMs', Number(e.target.value))}
            aria-describedby={timeoutHelpId}
          />
          <p id={timeoutHelpId} className="text-sm text-muted-foreground">
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
            aria-describedby={responseTransformHelpId}
          />
          <p id={responseTransformHelpId} className="text-sm text-muted-foreground">
            JavaScript expression to parse the extracted data
          </p>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 font-medium">Browser Steps</h4>
          {fieldErrors.steps && (
            <HelperText id={stepsErrorId} error role="alert" className="mb-3">
              {fieldErrors.steps}
            </HelperText>
          )}

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
                    <SelectTrigger
                      id={`step-${index}-action`}
                      {...getStepErrorProps(index, 'action')}
                    >
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="navigate">Navigate</SelectItem>
                      <SelectItem value="click">Click</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                      <SelectItem value="extract">Extract</SelectItem>
                      <SelectItem value="screenshot">Screenshot</SelectItem>
                      <SelectItem value="wait">Wait</SelectItem>
                      <SelectItem value="waitForNewChildren">Wait for New Children</SelectItem>
                    </SelectContent>
                  </Select>
                  <BrowserFieldError
                    id={getStepErrorId(index, 'action')}
                    error={getStepError(index, 'action')}
                  />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove step ${index + 1}`}
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
                      {...getStepErrorProps(index, 'url')}
                    />
                    <BrowserFieldError
                      id={getStepErrorId(index, 'url')}
                      error={getStepError(index, 'url')}
                    />
                  </div>
                )}

                {(step.action === 'click' ||
                  step.action === 'type' ||
                  step.action === 'extract') && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`step-${index}-selector`}>
                        {step.action === 'extract'
                          ? 'CSS Selector (optional with script)'
                          : 'Selector'}
                      </Label>
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
                        {...getStepErrorProps(index, 'selector')}
                      />
                      <BrowserFieldError
                        id={getStepErrorId(index, 'selector')}
                        error={getStepError(index, 'selector')}
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
                      {...getStepErrorProps(index, 'text')}
                    />
                    <BrowserFieldError
                      id={getStepErrorId(index, 'text')}
                      error={getStepError(index, 'text')}
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
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
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
                        {...getStepErrorProps(index, 'name')}
                      />
                      <BrowserFieldError
                        id={getStepErrorId(index, 'name')}
                        error={getStepError(index, 'name')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`step-${index}-script`}>
                        JavaScript Extraction Script (advanced)
                      </Label>
                      <Textarea
                        id={`step-${index}-script`}
                        value={step.args?.script || ''}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, script: e.target.value || undefined },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                        placeholder="return document.querySelector('.result')?.textContent;"
                        aria-describedby={`step-${index}-script-help`}
                      />
                      <HelperText id={`step-${index}-script-help`} className="text-sm">
                        Optional. Runs in the target page context and takes priority over the CSS
                        selector when provided.
                      </HelperText>
                    </div>
                  </div>
                )}

                {step.action === 'screenshot' && (
                  <div className="space-y-2">
                    <Label htmlFor={`step-${index}-path`}>Screenshot File Path</Label>
                    <Input
                      id={`step-${index}-path`}
                      value={step.args?.path || ''}
                      onChange={(e) => {
                        const newSteps = [...(selectedTarget.config.steps || [])];
                        newSteps[index] = {
                          ...step,
                          args: { ...step.args, path: e.target.value },
                        };
                        updateCustomTarget('steps', newSteps);
                      }}
                      placeholder="screenshots/result.png"
                      {...getStepErrorProps(index, 'path')}
                    />
                    <BrowserFieldError
                      id={getStepErrorId(index, 'path')}
                      error={getStepError(index, 'path')}
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
                        {...getStepErrorProps(index, 'parentSelector')}
                      />
                      <BrowserFieldError
                        id={getStepErrorId(index, 'parentSelector')}
                        error={getStepError(index, 'parentSelector')}
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
            aria-describedby={fieldErrors.steps ? stepsErrorId : undefined}
            onClick={() => {
              const newSteps = [
                ...(selectedTarget.config.steps || []),
                { action: 'navigate', args: { url: '' } },
              ];
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
