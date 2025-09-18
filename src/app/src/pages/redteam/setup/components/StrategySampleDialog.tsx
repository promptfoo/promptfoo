import React from 'react';

import MagicWandIcon from '@mui/icons-material/AutoFixHigh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';

interface StrategySample {
  title: string;
  summary: string;
  mode: 'template' | 'simulate';
  modifiedPrompts?: string[];
  conversation?: Array<{
    turn: number;
    intent: string;
    userMessage: string;
    assistantResponse: string;
    technique?: string;
    escalationLevel?: string;
  }>;
  metadata: {
    originalPrompt?: string;
    strategyId: string;
    effectiveness: 'low' | 'medium' | 'high';
    complexity: 'low' | 'medium' | 'high';
    unavailable?: boolean;
    category?: string;
    turns?: number;
    simulationNote?: string;
    [key: string]: any;
  };
}

interface StrategySampleDialogProps {
  open: boolean;
  onClose: () => void;
  strategyId: string | null;
  isGenerating: boolean;
  generatedSample: StrategySample | null;
  onGenerate?: () => void;
}

export const StrategySampleDialog: React.FC<StrategySampleDialogProps> = ({
  open,
  onClose,
  strategyId,
  isGenerating,
  generatedSample,
  onGenerate,
}) => {
  const theme = useTheme();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isGenerating
          ? 'Generating Strategy Sample...'
          : generatedSample
            ? generatedSample.title
            : 'Strategy Sample Generation Failed'}
      </DialogTitle>
      <DialogContent>
        {isGenerating ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Generating strategy sample...
            </Typography>
          </Box>
        ) : generatedSample ? (
          <Box sx={{ pt: 2 }}>
            <Alert
              severity={generatedSample.metadata.unavailable ? 'warning' : 'info'}
              sx={{ mb: 3, alignItems: 'center' }}
            >
              <Typography variant="body2">
                {generatedSample.metadata.unavailable ? (
                  <>
                    The <code>{strategyId}</code> strategy is not yet available for sample
                    generation. This {generatedSample.metadata.category} strategy will be supported
                    in a future milestone.
                  </>
                ) : generatedSample.mode === 'simulate' ? (
                  <>
                    This demonstrates how the <code>{strategyId}</code> strategy works through a
                    simulated conversation. The actual redteam run will use this strategy against
                    your configured target.
                  </>
                ) : (
                  <>
                    This demonstrates how the <code>{strategyId}</code> strategy transforms prompts.
                    The actual redteam run will apply this transformation to all generated test
                    cases.
                  </>
                )}
              </Typography>
            </Alert>

            {/* Strategy Metadata */}
            <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`Effectiveness: ${generatedSample.metadata.effectiveness}`}
                size="small"
                color={
                  generatedSample.metadata.effectiveness === 'high'
                    ? 'success'
                    : generatedSample.metadata.effectiveness === 'medium'
                      ? 'warning'
                      : 'default'
                }
              />
              <Chip
                label={`Complexity: ${generatedSample.metadata.complexity}`}
                size="small"
                variant="outlined"
              />
              <Chip label={`Mode: ${generatedSample.mode}`} size="small" variant="outlined" />
            </Box>

            {/* Strategy Description */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {generatedSample.summary}
            </Typography>

            {/* Original Prompt (if available) */}
            {generatedSample.metadata.originalPrompt && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Original Prompt:
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
                  {generatedSample.metadata.originalPrompt}
                </Box>
              </Box>
            )}

            {/* Content - either transformed prompts or conversation */}
            {generatedSample.mode === 'simulate' && generatedSample.conversation ? (
              /* Simulated Conversation */
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Simulated Conversation ({generatedSample.conversation.length} turns):
                </Typography>
                {generatedSample.metadata.simulationNote && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      {generatedSample.metadata.simulationNote}
                    </Typography>
                  </Alert>
                )}
                {generatedSample.conversation.map((turn, index) => (
                  <Box key={turn.turn} sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" component="div" sx={{ mb: 1, fontWeight: 600 }}>
                      Turn {turn.turn}: {turn.intent}
                    </Typography>
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Technique: {turn.technique} | Escalation: {turn.escalationLevel}
                      </Typography>
                    </Box>

                    {/* User Message */}
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                        User:
                      </Typography>
                      <Box
                        sx={{
                          p: 1.5,
                          backgroundColor: theme.palette.mode === 'dark' ? theme.palette.info.dark : theme.palette.info.light,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: theme.palette.mode === 'dark' ? theme.palette.info.main : theme.palette.info.main,
                          fontSize: '0.875rem',
                        }}
                      >
                        {turn.userMessage}
                      </Box>
                    </Box>

                    {/* Assistant Response */}
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                        Assistant:
                      </Typography>
                      <Box
                        sx={{
                          p: 1.5,
                          backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300',
                          fontSize: '0.875rem',
                        }}
                      >
                        {turn.assistantResponse}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              /* Transformed Prompts (template mode) */
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Transformed Prompt{generatedSample.modifiedPrompts?.length > 1 ? 's' : ''}:
                </Typography>
                {generatedSample.modifiedPrompts?.map((prompt, index) => (
                  <Box
                    key={index}
                    sx={{
                      p: 2,
                      mb: index < (generatedSample.modifiedPrompts?.length || 0) - 1 ? 2 : 0,
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
                    {prompt}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Failed to generate strategy sample. Please try again.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!generatedSample && !isGenerating && (
          <Button variant="contained" onClick={onGenerate} disabled={isGenerating}>
            Retry
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export const StrategySampleGenerateButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  size?: 'small' | 'medium';
}> = ({ onClick, disabled = false, isGenerating = false, size = 'small' }) => (
  <Tooltip title="Generate strategy sample">
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
