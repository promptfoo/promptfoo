import React from 'react';

import MagicWandIcon from '@mui/icons-material/AutoFixHigh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
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
import { grey } from '@mui/material/colors';

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

  const handleCopyToClipboard = () => {
    if (!generatedSample) {
      return;
    }

    let content = `# ${generatedSample.title}\n\n`;
    content += `**Strategy:** ${strategyId}\n`;
    content += `**Mode:** ${generatedSample.mode}\n`;
    content += `**Effectiveness:** ${generatedSample.metadata.effectiveness}\n`;
    content += `**Complexity:** ${generatedSample.metadata.complexity}\n\n`;
    content += `${generatedSample.summary}\n\n`;

    if (generatedSample.metadata.originalPrompt) {
      content += `## Original Prompt\n\`\`\`\n${generatedSample.metadata.originalPrompt}\n\`\`\`\n\n`;
    }

    if (generatedSample.mode === 'simulate' && generatedSample.conversation) {
      content += `## Conversation (${generatedSample.conversation.length} turns)\n\n`;
      generatedSample.conversation.forEach((turn) => {
        content += `### Turn ${turn.turn}: ${turn.intent}\n`;
        content += `**Technique:** ${turn.technique} | **Escalation:** ${turn.escalationLevel}\n\n`;
        content += `**User:** ${turn.userMessage}\n\n`;
        content += `**Assistant:** ${turn.assistantResponse}\n\n`;
      });
    } else if (generatedSample.modifiedPrompts) {
      content += `## Transformed Prompts\n\n`;
      generatedSample.modifiedPrompts.forEach((prompt, index) => {
        content += `### Prompt ${index + 1}\n\`\`\`\n${prompt}\n\`\`\`\n\n`;
      });
    }

    navigator.clipboard.writeText(content);
  };

  const handleExportAsJson = () => {
    if (!generatedSample) {
      return;
    }

    const exportData = {
      strategyId,
      timestamp: new Date().toISOString(),
      sample: generatedSample,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strategy-sample-${strategyId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
                    backgroundColor: theme.palette.mode === 'dark' ? grey[900] : grey[50],
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: theme.palette.mode === 'dark' ? grey[700] : grey[300],
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
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle2" gutterBottom>
                    Simulated Conversation ({generatedSample.conversation.length} turns):
                  </Typography>
                </Box>
                {generatedSample.metadata.simulationNote && (
                  <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2">
                      {generatedSample.metadata.simulationNote}
                    </Typography>
                  </Alert>
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {generatedSample.conversation.map((turn, index) => (
                    <Box
                      key={turn.turn}
                      sx={{
                        p: 2,
                        backgroundColor: theme.palette.mode === 'dark' ? grey[900] : grey[50],
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: theme.palette.mode === 'dark' ? grey[700] : grey[200],
                      }}
                    >
                      {/* Turn Header */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Chip
                          label={`Turn ${turn.turn}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                          {turn.intent}
                        </Typography>
                      </Box>

                      {/* Technique & Escalation Tags */}
                      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                        <Chip
                          label={`Technique: ${turn.technique}`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem' }}
                        />
                        <Chip
                          label={`Escalation: ${turn.escalationLevel}`}
                          size="small"
                          variant="outlined"
                          color={
                            turn.escalationLevel === 'high'
                              ? 'error'
                              : turn.escalationLevel === 'medium'
                                ? 'warning'
                                : 'default'
                          }
                          sx={{ fontSize: '0.75rem' }}
                        />
                      </Box>

                      {/* User Message */}
                      <Box sx={{ mb: 2 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, mb: 1, color: 'primary.main' }}
                        >
                          👤 User:
                        </Typography>
                        <Box
                          sx={{
                            p: 2,
                            backgroundColor:
                              theme.palette.mode === 'dark'
                                ? theme.palette.primary.dark
                                : theme.palette.primary.light,
                            borderRadius: 1.5,
                            border: '1px solid',
                            borderColor:
                              theme.palette.mode === 'dark'
                                ? theme.palette.primary.main
                                : theme.palette.primary.main,
                            fontSize: '0.875rem',
                            lineHeight: 1.5,
                            '& pre': {
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            },
                          }}
                        >
                          {turn.userMessage}
                        </Box>
                      </Box>

                      {/* Assistant Response */}
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}
                        >
                          🤖 Assistant:
                        </Typography>
                        <Box
                          sx={{
                            p: 2,
                            backgroundColor: theme.palette.mode === 'dark' ? grey[800] : grey[100],
                            borderRadius: 1.5,
                            border: '1px solid',
                            borderColor: theme.palette.mode === 'dark' ? grey[600] : grey[300],
                            fontSize: '0.875rem',
                            lineHeight: 1.5,
                            '& pre': {
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            },
                          }}
                        >
                          {turn.assistantResponse}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
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
                      backgroundColor: theme.palette.mode === 'dark' ? grey[900] : grey[50],
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: theme.palette.mode === 'dark' ? grey[700] : grey[300],
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
        {generatedSample && !isGenerating && (
          <>
            <Tooltip title="Copy as Markdown">
              <Button
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyToClipboard}
                variant="outlined"
                size="small"
              >
                Copy
              </Button>
            </Tooltip>
            <Tooltip title="Export as JSON file">
              <Button
                startIcon={<FileDownloadIcon />}
                onClick={handleExportAsJson}
                variant="outlined"
                size="small"
              >
                Export
              </Button>
            </Tooltip>
          </>
        )}
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
