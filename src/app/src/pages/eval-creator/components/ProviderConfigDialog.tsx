import React, { useEffect, useState } from 'react';

import JsonTextField from '@app/components/JsonTextField';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface ProviderConfigDialogProps {
  open: boolean;
  providerId: string;
  config?: Record<string, any>;
  onClose: () => void;
  onSave: (providerId: string, config: Record<string, any>) => void;
}

const ProviderConfigDialog = ({
  open,
  providerId,
  config = {},
  onClose,
  onSave,
}: ProviderConfigDialogProps) => {
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(config);
  const isAzureProvider = providerId.startsWith('azure:');
  const isBedrockAgentProvider = providerId.startsWith('bedrock-agent:');

  // Helper function to check if a value has content
  const hasContent = (val: any): boolean => {
    return val !== undefined && val !== null && val !== '';
  };

  const isDeploymentIdValid = !isAzureProvider || hasContent(localConfig.deployment_id);
  const isAgentIdValid = !isBedrockAgentProvider || hasContent(localConfig.agentId);
  const isAgentAliasIdValid = !isBedrockAgentProvider || hasContent(localConfig.agentAliasId);

  // Reset local config when the dialog opens or providerId changes
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Provider Configuration
        <Typography
          variant="subtitle1"
          color="text.secondary"
          sx={{ mt: 1, fontSize: '0.9rem', fontFamily: 'monospace' }}
        >
          {providerId}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {isAzureProvider && (
          <Box mb={2}>
            <Alert severity={isDeploymentIdValid ? 'info' : 'warning'}>
              {isDeploymentIdValid
                ? 'Azure OpenAI requires a deployment ID that matches your deployment name in the Azure portal.'
                : 'You must specify a deployment ID for Azure OpenAI models. This is the name you gave your model deployment in the Azure portal.'}
            </Alert>
          </Box>
        )}

        {isBedrockAgentProvider && (
          <Box mb={2}>
            <Alert severity={isAgentIdValid && isAgentAliasIdValid ? 'info' : 'warning'}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Amazon Bedrock Agent Configuration
              </Typography>
              {isAgentIdValid && isAgentAliasIdValid ? (
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  <li>
                    <strong>Agent ID:</strong> {localConfig.agentId || 'Not specified'}
                  </li>
                  {localConfig.agentAliasId && (
                    <li>
                      <strong>Agent Alias:</strong> {localConfig.agentAliasId}
                    </li>
                  )}
                  {localConfig.region && (
                    <li>
                      <strong>Region:</strong> {localConfig.region}
                    </li>
                  )}
                  {localConfig.knowledgeBaseConfigurations && (
                    <li>
                      <strong>Knowledge Bases:</strong>{' '}
                      {Array.isArray(localConfig.knowledgeBaseConfigurations)
                        ? localConfig.knowledgeBaseConfigurations
                            .map((kb: any) => kb.knowledgeBaseId || 'Unknown')
                            .join(', ')
                        : 'Configured'}
                    </li>
                  )}
                  {localConfig.enableTrace && (
                    <li>
                      <strong>Tracing:</strong> Enabled
                    </li>
                  )}
                </Box>
              ) : (
                <Typography variant="body2">
                  You must specify both agentId and agentAliasId for Bedrock Agents. These are the
                  agent ID and alias ID of your deployed agent in the AWS console.
                </Typography>
              )}
            </Alert>
          </Box>
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
              <Box key={key} my={2}>
                <TextField
                  label={isRequired ? `${key} (Required)` : key}
                  value={value === undefined ? '' : value}
                  onChange={handleChange}
                  fullWidth
                  required={isRequired}
                  error={isRequired && !isValid}
                  helperText={
                    isRequired && !isValid
                      ? isDeploymentId
                        ? 'This field is required for Azure OpenAI'
                        : isAgentId || isAgentAliasId
                          ? 'This field is required for Bedrock Agents'
                          : 'This field is required'
                      : ''
                  }
                  InputLabelProps={{ shrink: true }}
                  type={typeof value === 'number' ? 'number' : 'text'}
                  variant={isRequired ? 'outlined' : undefined}
                  color={isRequired ? 'primary' : undefined}
                  focused={isRequired && !isValid}
                />
              </Box>
            );
          } else {
            return (
              <Box key={key} my={2}>
                <JsonTextField
                  label={key}
                  defaultValue={JSON.stringify(value)}
                  onChange={(parsed) => {
                    setLocalConfig({ ...localConfig, [key]: parsed });
                  }}
                  fullWidth
                  multiline
                  minRows={2}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            );
          }
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={!isDeploymentIdValid || !isAgentIdValid || !isAgentAliasIdValid}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
