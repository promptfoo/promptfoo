import React from 'react';

import AddIcon from '@mui/icons-material/Add';
import MagicWandIcon from '@mui/icons-material/AutoFixHigh';
import RemoveIcon from '@mui/icons-material/Remove';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  type Strategy,
} from '@promptfoo/redteam/constants';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';
import { useApiHealth } from '@app/hooks/useApiHealth';

interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  plugin: Plugin | null;
  strategy: Strategy | null;
  isGenerating: boolean;
  generatedTestCase: { prompt: string; context?: string } | null;
  targetResponse?: { output: string; error?: string } | null;
  isRunningTest?: boolean;
  mode?: 'config' | 'result';
  config?: any;
  onConfigChange?: (config: any) => void;
  onGenerate?: (config: any) => void;
  requiresConfig?: boolean;
  supportsConfig?: boolean;
  isConfigValid?: boolean;
}

export const TestCaseDialog: React.FC<TestCaseDialogProps> = ({
  open,
  onClose,
  plugin,
  strategy,
  isGenerating,
  generatedTestCase,
  targetResponse,
  isRunningTest = false,
  mode = 'result',
  config,
  onConfigChange,
  onGenerate,
  requiresConfig = false,
  supportsConfig = false,
  isConfigValid = true,
}) => {
  const theme = useTheme();

  const pluginName = typeof plugin === 'string' ? plugin : plugin || '';
  const pluginDisplayName =
    displayNameOverrides[pluginName as Plugin] ||
    categoryAliases[pluginName as Plugin] ||
    pluginName;

  const strategyName = typeof strategy === 'string' ? strategy : strategy || '';
  const strategyDisplayName = displayNameOverrides[strategyName as Strategy] || strategyName;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isGenerating
          ? 'Generating Test Case...'
          : generatedTestCase
            ? `Generated Test Case for ${pluginDisplayName} / ${strategyDisplayName}`
            : mode === 'config'
              ? `Configure ${pluginDisplayName}`
              : 'Test Generation Failed'}
      </DialogTitle>
      <DialogContent>
        {mode === 'config' && supportsConfig && !isGenerating && !generatedTestCase ? (
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {requiresConfig
                ? 'This plugin requires configuration to generate relevant test cases.'
                : 'This plugin supports configuration to generate more targeted test cases. Configuration is optional.'}
            </Typography>

            {pluginName === 'indirect-prompt-injection' && (
              <TextField
                fullWidth
                required
                label="Indirect Injection Variable"
                value={config?.indirectInjectionVar || ''}
                onChange={(e) =>
                  onConfigChange?.({ ...config, indirectInjectionVar: e.target.value })
                }
                placeholder="e.g., name, userContent, document"
                helperText="Specify the variable name in your prompt that contains untrusted data"
                sx={{ mb: 2 }}
              />
            )}

            {pluginName === 'prompt-extraction' && (
              <TextField
                fullWidth
                required
                label="System Prompt"
                multiline
                rows={4}
                value={config?.systemPrompt || ''}
                onChange={(e) => onConfigChange?.({ ...config, systemPrompt: e.target.value })}
                placeholder="Enter your actual system prompt here..."
                helperText="Provide your system prompt so the plugin can test if it can be extracted"
                sx={{ mb: 2 }}
              />
            )}

            {pluginName === 'bfla' && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  BFLA tests whether users can access functions they shouldn't. Leave empty for
                  general testing.
                </Typography>
                {((config?.targetIdentifiers as string[]) || ['']).map(
                  (item: string, index: number) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <TextField
                        fullWidth
                        label={`Target Identifier ${index + 1}`}
                        variant="outlined"
                        value={item}
                        onChange={(e) => {
                          const newArray = [...((config?.targetIdentifiers as string[]) || [''])];
                          newArray[index] = e.target.value;
                          onConfigChange?.({ ...config, targetIdentifiers: newArray });
                        }}
                        placeholder="e.g., getUserData, /api/admin/users, deleteUser"
                        sx={{ mr: 1 }}
                      />
                      {((config?.targetIdentifiers as string[]) || ['']).length > 1 && (
                        <IconButton
                          size="small"
                          onClick={() => {
                            const newArray = [...((config?.targetIdentifiers as string[]) || [''])];
                            newArray.splice(index, 1);
                            if (newArray.length === 0) {
                              newArray.push('');
                            }
                            onConfigChange?.({ ...config, targetIdentifiers: newArray });
                          }}
                        >
                          <RemoveIcon />
                        </IconButton>
                      )}
                    </Box>
                  ),
                )}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const currentArray = (config?.targetIdentifiers as string[]) || [''];
                    onConfigChange?.({ ...config, targetIdentifiers: [...currentArray, ''] });
                  }}
                  variant="outlined"
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={((config?.targetIdentifiers as string[]) || ['']).some(
                    (item) => item.trim() === '',
                  )}
                >
                  Add
                </Button>
              </Box>
            )}

            {pluginName === 'bola' && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  BOLA tests whether users can access objects they shouldn't own. Leave empty for
                  general testing.
                </Typography>
                {((config?.targetSystems as string[]) || ['']).map(
                  (item: string, index: number) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <TextField
                        fullWidth
                        label={`Target System ${index + 1}`}
                        variant="outlined"
                        value={item}
                        onChange={(e) => {
                          const newArray = [...((config?.targetSystems as string[]) || [''])];
                          newArray[index] = e.target.value;
                          onConfigChange?.({ ...config, targetSystems: newArray });
                        }}
                        placeholder="e.g., user_123, order_456, document_789"
                        sx={{ mr: 1 }}
                      />
                      {((config?.targetSystems as string[]) || ['']).length > 1 && (
                        <IconButton
                          size="small"
                          onClick={() => {
                            const newArray = [...((config?.targetSystems as string[]) || [''])];
                            newArray.splice(index, 1);
                            if (newArray.length === 0) {
                              newArray.push('');
                            }
                            onConfigChange?.({ ...config, targetSystems: newArray });
                          }}
                        >
                          <RemoveIcon />
                        </IconButton>
                      )}
                    </Box>
                  ),
                )}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const currentArray = (config?.targetSystems as string[]) || [''];
                    onConfigChange?.({ ...config, targetSystems: [...currentArray, ''] });
                  }}
                  variant="outlined"
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={((config?.targetSystems as string[]) || ['']).some(
                    (item) => item.trim() === '',
                  )}
                >
                  Add
                </Button>
              </Box>
            )}

            {pluginName === 'ssrf' && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  SSRF tests whether your application can be tricked into making requests to
                  unintended destinations. Leave empty for general testing.
                </Typography>
                {((config?.targetUrls as string[]) || ['']).map((item: string, index: number) => (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <TextField
                      fullWidth
                      label={`Target URL ${index + 1}`}
                      variant="outlined"
                      value={item}
                      onChange={(e) => {
                        const newArray = [...((config?.targetUrls as string[]) || [''])];
                        newArray[index] = e.target.value;
                        onConfigChange?.({ ...config, targetUrls: newArray });
                      }}
                      placeholder="e.g., http://internal-api.company.com, file:///etc/passwd"
                      sx={{ mr: 1 }}
                    />
                    {((config?.targetUrls as string[]) || ['']).length > 1 && (
                      <IconButton
                        size="small"
                        onClick={() => {
                          const newArray = [...((config?.targetUrls as string[]) || [''])];
                          newArray.splice(index, 1);
                          if (newArray.length === 0) {
                            newArray.push('');
                          }
                          onConfigChange?.({ ...config, targetUrls: newArray });
                        }}
                      >
                        <RemoveIcon />
                      </IconButton>
                    )}
                  </Box>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const currentArray = (config?.targetUrls as string[]) || [''];
                    onConfigChange?.({ ...config, targetUrls: [...currentArray, ''] });
                  }}
                  variant="outlined"
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={((config?.targetUrls as string[]) || ['']).some(
                    (item) => item.trim() === '',
                  )}
                >
                  Add
                </Button>
              </Box>
            )}
          </Box>
        ) : isGenerating ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Generating test case...
            </Typography>
          </Box>
        ) : generatedTestCase && mode === 'result' ? (
          <Box sx={{ pt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Test Case:
            </Typography>
            <Box
              sx={{
                p: 2,
                backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                borderRadius: 1,
                border: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                mb: 3,
              }}
            >
              {generatedTestCase.prompt}
            </Box>

            {isRunningTest ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
                <CircularProgress sx={{ mb: 2 }} />
                <Typography variant="body2" color="text.secondary">
                  Running test against target...
                </Typography>
              </Box>
            ) : targetResponse ? (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Target Response:
                </Typography>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {targetResponse.error ? (
                    <Box>
                      <Typography color="error" variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        Error:
                      </Typography>
                      <Typography variant="body2" color="error">
                        {targetResponse.error}
                      </Typography>
                    </Box>
                  ) : (
                    targetResponse.output
                  )}
                </Box>
              </Box>
            ) : null}

            <Alert severity="info" sx={{ mt: 2 }}>
              Dissatisfied with the test case? Fine tune it by adjusting your{' '}
              {pluginName === 'policy' ? 'policy' : 'application'} details.
            </Alert>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        {pluginName && hasSpecificPluginDocumentation(pluginName as Plugin) && (
          <Box sx={{ flex: 1, mr: 2 }}>
            <Link
              href={getPluginDocumentationUrl(pluginName as Plugin)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: '0.875rem',
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline',
                },
                paddingLeft: 2,
              }}
            >
              Learn more about {pluginDisplayName}
              <Box component="span" sx={{ fontSize: '0.75rem' }}>
                ↗
              </Box>
            </Link>
          </Box>
        )}
        <Button onClick={onClose}>{mode === 'config' ? 'Cancel' : 'Close'}</Button>
        {mode === 'config' && supportsConfig && (
          <>
            {!requiresConfig && (
              <Button onClick={() => onGenerate?.({})} disabled={isGenerating}>
                Skip Configuration
              </Button>
            )}
            <Button
              variant="contained"
              onClick={() => onGenerate?.(config)}
              disabled={isGenerating || !isConfigValid}
            >
              Generate Test Case
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export const TestCaseGenerateButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  size?: 'small' | 'medium';
  tooltipTitle?: string;
}> = ({ onClick, disabled = false, isGenerating = false, size = 'small', tooltipTitle }) => {
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();
  const isRemoteDisabled = apiHealthStatus !== 'connected';

  return (
    <Tooltip
      title={
        isRemoteDisabled
          ? 'Requires Promptfoo Cloud connection'
          : tooltipTitle || 'Generate test case'
      }
    >
      <span>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          disabled={disabled || isRemoteDisabled}
          sx={{ color: 'text.secondary' }}
        >
          {isGenerating ? (
            <CircularProgress size={size === 'small' ? 16 : 20} />
          ) : (
            <MagicWandIcon fontSize={size} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};
