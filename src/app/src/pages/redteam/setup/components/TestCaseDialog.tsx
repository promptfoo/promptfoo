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
            : 'Test Generation Failed'}
      </DialogTitle>
      <DialogContent>
        {isGenerating ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Generating test case...
            </Typography>
          </Box>
        ) : generatedTestCase ? (
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
        <Button onClick={onClose}>Close</Button>
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
