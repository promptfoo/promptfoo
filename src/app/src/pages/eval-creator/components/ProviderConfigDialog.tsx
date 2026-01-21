import React, { useEffect, useState } from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { JsonTextarea } from '@app/components/ui/json-textarea';
import { Label } from '@app/components/ui/label';
import { cn } from '@app/lib/utils';

interface ProviderConfigDialogProps {
  open: boolean;
  providerId: string;
  config?: Record<string, unknown>;
  onClose: () => void;
  onSave: (providerId: string, config: Record<string, unknown>) => void;
}

const ProviderConfigDialog = ({
  open,
  providerId,
  config = {},
  onClose,
  onSave,
}: ProviderConfigDialogProps) => {
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(config);
  const isAzureProvider = providerId.startsWith('azure:');
  const isBedrockAgentProvider = providerId.startsWith('bedrock-agent:');

  // Helper function to check if a value has content
  const hasContent = (val: unknown): boolean => {
    return val !== undefined && val !== null && val !== '';
  };

  const isDeploymentIdValid = !isAzureProvider || hasContent(localConfig.deployment_id);
  const isAgentIdValid = !isBedrockAgentProvider || hasContent(localConfig.agentId);
  const isAgentAliasIdValid = !isBedrockAgentProvider || hasContent(localConfig.agentAliasId);

  // Reset local config when the dialog opens or providerId changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    setLocalConfig(config);
  }, [open, providerId, config]);

  const handleSave = () => {
    onSave(providerId, localConfig);
  };

  // Create an ordered list of keys with important fields first
  const configKeys = React.useMemo(() => {
    const keys = Object.keys(localConfig);
    if (isAzureProvider) {
      return ['deployment_id', ...keys.filter((key) => key !== 'deployment_id')];
    }
    if (isBedrockAgentProvider) {
      // Prioritize important bedrock-agent fields
      const priorityFields = ['agentId', 'agentAliasId', 'region', 'enableTrace'];
      const remaining = keys.filter((key) => !priorityFields.includes(key));
      return [...priorityFields.filter((field) => keys.includes(field)), ...remaining];
    }
    return keys;
  }, [localConfig, isAzureProvider, isBedrockAgentProvider]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Provider Configuration</DialogTitle>
          <p className="text-sm text-muted-foreground font-mono mt-1">{providerId}</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isAzureProvider && (
            <Alert variant={isDeploymentIdValid ? 'default' : 'destructive'}>
              <AlertDescription>
                {isDeploymentIdValid
                  ? 'Azure OpenAI requires a deployment ID that matches your deployment name in the Azure portal.'
                  : 'You must specify a deployment ID for Azure OpenAI models. This is the name you gave your model deployment in the Azure portal.'}
              </AlertDescription>
            </Alert>
          )}

          {isBedrockAgentProvider && (
            <Alert variant={isAgentIdValid && isAgentAliasIdValid ? 'default' : 'destructive'}>
              <AlertContent>
                <AlertTitle className="font-semibold">
                  Amazon Bedrock Agent Configuration
                </AlertTitle>
                <AlertDescription>
                  {isAgentIdValid && isAgentAliasIdValid ? (
                    <ul className="mt-2 ml-4 list-disc space-y-1 text-sm">
                      <li>
                        <strong>Agent ID:</strong>{' '}
                        {(localConfig.agentId as string) || 'Not specified'}
                      </li>
                      {localConfig.agentAliasId ? (
                        <li>
                          <strong>Agent Alias:</strong> {localConfig.agentAliasId as string}
                        </li>
                      ) : null}
                      {localConfig.region ? (
                        <li>
                          <strong>Region:</strong> {localConfig.region as string}
                        </li>
                      ) : null}
                      {localConfig.knowledgeBaseConfigurations ? (
                        <li>
                          <strong>Knowledge Bases:</strong>{' '}
                          {
                            (Array.isArray(localConfig.knowledgeBaseConfigurations)
                              ? localConfig.knowledgeBaseConfigurations
                                  .map(
                                    (kb: { knowledgeBaseId?: string }) =>
                                      kb.knowledgeBaseId || 'Unknown',
                                  )
                                  .join(', ')
                              : 'Configured') as string
                          }
                        </li>
                      ) : null}
                      {localConfig.enableTrace ? (
                        <li>
                          <strong>Tracing:</strong> Enabled
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm">
                      You must specify both agentId and agentAliasId for Bedrock Agents. These are
                      the agent ID and alias ID of your deployed agent in the AWS console.
                    </p>
                  )}
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}

          {configKeys.map((key) => {
            const value = localConfig[key];
            let handleChange;
            const isDeploymentId = isAzureProvider && key === 'deployment_id';
            const isAgentId = isBedrockAgentProvider && key === 'agentId';
            const isAgentAliasId = isBedrockAgentProvider && key === 'agentAliasId';
            const isRequired = isDeploymentId || isAgentId || isAgentAliasId;
            const isValid = !isRequired || hasContent(value);

            if (
              typeof value === 'number' ||
              typeof value === 'boolean' ||
              typeof value === 'string'
            ) {
              if (typeof value === 'number') {
                handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalConfig({ ...localConfig, [key]: Number.parseFloat(e.target.value) });
              } else if (typeof value === 'boolean') {
                handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalConfig({ ...localConfig, [key]: e.target.value === 'true' });
              } else {
                handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const trimmed = e.target.value.trim();
                  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                      setLocalConfig({ ...localConfig, [key]: JSON.parse(trimmed) });
                    } catch {
                      setLocalConfig({ ...localConfig, [key]: trimmed });
                    }
                  } else if (trimmed === 'null') {
                    setLocalConfig({ ...localConfig, [key]: null });
                  } else if (trimmed === 'undefined') {
                    setLocalConfig({ ...localConfig, [key]: undefined });
                  } else {
                    setLocalConfig({ ...localConfig, [key]: trimmed });
                  }
                };
              }

              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>
                    {key}
                    {isRequired && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    id={key}
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={value === undefined ? '' : String(value)}
                    onChange={handleChange}
                    className={cn(isRequired && !isValid && 'border-destructive')}
                  />
                  {isRequired && !isValid && (
                    <p className="text-sm text-destructive">
                      {isDeploymentId
                        ? 'This field is required for Azure OpenAI'
                        : isAgentId || isAgentAliasId
                          ? 'This field is required for Bedrock Agents'
                          : 'This field is required'}
                    </p>
                  )}
                </div>
              );
            } else {
              return (
                <JsonTextarea
                  key={key}
                  label={key}
                  defaultValue={JSON.stringify(value, null, 2)}
                  onChange={(parsed) => {
                    setLocalConfig({ ...localConfig, [key]: parsed });
                  }}
                />
              );
            }
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDeploymentIdValid || !isAgentIdValid || !isAgentAliasIdValid}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProviderConfigDialog;
