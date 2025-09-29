import React from 'react';

import MagicWandIcon from '@mui/icons-material/AutoFixHigh';
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
import { categoryAliases, displayNameOverrides, type Plugin } from '@promptfoo/redteam/constants';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';

interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  plugin: Plugin | string | null;
  isGenerating: boolean;
  generatedTestCase: { prompt: string; context?: string } | null;
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
  isGenerating,
  generatedTestCase,
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
  const displayName =
    displayNameOverrides[pluginName as Plugin] ||
    categoryAliases[pluginName as Plugin] ||
    pluginName;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isGenerating
          ? 'Generating Test Case...'
          : generatedTestCase
            ? 'Generated Test Case'
            : mode === 'config'
              ? `Configure ${displayName}`
              : 'Test Generation Failed'}
      </DialogTitle>
      <DialogContent>
        {mode === 'config' && supportsConfig && !isGenerating && !generatedTestCase ? (
          <Box sx={{ pt: 2 }}>
            {pluginName === 'indirect-prompt-injection' && (
              <TextField
                label="Application definition (e.g., 'Customer support chatbot')"
                fullWidth
                value={config?.applicationDefinition || ''}
                onChange={(e) =>
                  onConfigChange?.({ ...config, applicationDefinition: e.target.value })
                }
                margin="normal"
                required={requiresConfig}
                helperText={requiresConfig ? 'Required for this plugin' : 'Optional'}
              />
            )}
            {pluginName === 'prompt-extraction' && (
              <TextField
                label="System prompt to extract"
                fullWidth
                multiline
                rows={4}
                value={config?.systemPrompt || ''}
                onChange={(e) => onConfigChange?.({ ...config, systemPrompt: e.target.value })}
                margin="normal"
                required={requiresConfig}
                helperText={requiresConfig ? 'Required for this plugin' : 'Optional'}
              />
            )}
            {(pluginName === 'bfla' || pluginName === 'bola' || pluginName === 'ssrf') && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Target URLs (one per line)
                </Typography>
                {((config?.targetUrls as string[]) || ['']).map((url, index) => (
                  <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <TextField
                      fullWidth
                      value={url}
                      onChange={(e) => {
                        const newUrls = [...((config?.targetUrls as string[]) || [''])];
                        newUrls[index] = e.target.value;
                        onConfigChange?.({ ...config, targetUrls: newUrls });
                      }}
                      placeholder="https://example.com/api/endpoint"
                      size="small"
                    />
                    {((config?.targetUrls as string[]) || ['']).length > 1 && (
                      <IconButton
                        onClick={() => {
                          const newUrls = ((config?.targetUrls as string[]) || ['']).filter(
                            (_, i) => i !== index,
                          );
                          onConfigChange?.({ ...config, targetUrls: newUrls });
                        }}
                        size="small"
                        color="error"
                      >
                        ×
                      </IconButton>
                    )}
                  </Box>
                ))}
                <Button
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
            <Alert severity="info" sx={{ mb: 3, alignItems: 'center' }}>
              <Typography variant="body2">
                This is a sample test case generated for the <code>{pluginName}</code> plugin. Fine
                tune it by adjusting your {pluginName === 'policy' ? 'policy' : 'application'}{' '}
                details.
              </Typography>
            </Alert>
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
              }}
            >
              {generatedTestCase.prompt}
            </Box>
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
              Learn more about {displayName}
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
}> = ({ onClick, disabled = false, isGenerating = false, size = 'small' }) => (
  <Tooltip title="Generate test case">
    <IconButton
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      sx={{ color: 'text.secondary', ml: size === 'small' ? 0.5 : 1 }}
    >
      {isGenerating ? (
        <CircularProgress size={size === 'small' ? 16 : 20} />
      ) : (
        <MagicWandIcon fontSize={size} />
      )}
    </IconButton>
  </Tooltip>
);
