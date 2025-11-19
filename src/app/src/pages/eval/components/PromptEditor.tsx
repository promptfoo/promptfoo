import React from 'react';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface CodeDisplayProps {
  content: string;
  title: string;
  maxHeight?: string | number;
  onCopy: () => void;
  copied: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  showCopyButton?: boolean;
}

type CodeDisplayComponent = React.FC<CodeDisplayProps>;

interface PromptEditorProps {
  prompt: string;
  editMode: boolean;
  editedPrompt: string;
  replayLoading: boolean;
  replayError: string | null;
  onEditModeChange: (editMode: boolean) => void;
  onPromptChange: (prompt: string) => void;
  onReplay: () => void;
  onCancel: () => void;
  onCopy: () => void;
  copied: boolean;
  hoveredElement: string | null;
  onMouseEnter: (element: string) => void;
  onMouseLeave: () => void;
  CodeDisplay: CodeDisplayComponent;
  subtitleTypographySx: object;
  readOnly?: boolean;
}

export function PromptEditor({
  prompt,
  editMode,
  editedPrompt,
  replayLoading,
  replayError,
  onEditModeChange,
  onPromptChange,
  onReplay,
  onCancel,
  onCopy,
  copied,
  hoveredElement,
  onMouseEnter,
  onMouseLeave,
  CodeDisplay,
  subtitleTypographySx,
  readOnly = false,
}: PromptEditorProps) {
  return (
    <Box mb={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle1" sx={subtitleTypographySx}>
          Prompt
        </Typography>
        <Box display="flex" gap={1}>
          {!readOnly && !editMode && (
            <Tooltip title="Edit & Replay">
              <IconButton
                size="small"
                onClick={() => onEditModeChange(true)}
                sx={{
                  color: 'text.secondary',
                  '&:hover': {
                    color: 'primary.main',
                  },
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {!readOnly && editMode && (
            <>
              <Button
                size="small"
                variant="contained"
                startIcon={replayLoading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                onClick={onReplay}
                disabled={replayLoading || !editedPrompt.trim()}
              >
                Replay
              </Button>
              <Button
                size="small"
                onClick={() => {
                  onCancel();
                  onEditModeChange(false);
                  onPromptChange(prompt);
                }}
              >
                Cancel
              </Button>
            </>
          )}
        </Box>
      </Box>
      {editMode ? (
        <TextField
          fullWidth
          multiline
          variant="outlined"
          value={editedPrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          sx={{
            '& .MuiInputBase-root': {
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            },
          }}
          minRows={4}
          maxRows={20}
        />
      ) : (
        <CodeDisplay
          content={prompt}
          title=""
          onCopy={onCopy}
          copied={copied}
          onMouseEnter={() => onMouseEnter('prompt')}
          onMouseLeave={onMouseLeave}
          showCopyButton={hoveredElement === 'prompt' || copied}
        />
      )}
      {replayError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {replayError}
        </Alert>
      )}
    </Box>
  );
}
