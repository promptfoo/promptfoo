import React, { type KeyboardEvent, useEffect, useState } from 'react';

import EditIcon from '@mui/icons-material/Edit';
import EmailIcon from '@mui/icons-material/Email';
import InfoIcon from '@mui/icons-material/Info';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface AuthorChipProps {
  author: string | null;
  onEditAuthor: (newAuthor: string) => Promise<void>;
  currentUserEmail: string | null;
  editable: boolean;
  isCloudEnabled: boolean;
}

export const AuthorChip = ({
  author,
  onEditAuthor,
  currentUserEmail,
  editable,
  isCloudEnabled,
}: AuthorChipProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [email, setEmail] = useState(author || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!author && currentUserEmail) {
      setEmail(currentUserEmail);
    }
  }, [author, currentUserEmail]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setEmail(author || currentUserEmail || '');
    setError(null);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Handler for free-text mode (non-cloud)
  const handleSave = async () => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await onEditAuthor(email || '');
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for cloud mode actions (Claim/Remove)
  const handleCloudAction = async (newAuthor: string) => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await onEditAuthor(newAuthor);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      handleSave();
    }
  };

  const getTooltipTitle = () => {
    if (!editable) {
      if (!author) {
        return 'Author';
      }
      // For your own eval in cloud mode, just label the field
      if (isCloudEnabled && author === currentUserEmail) {
        return 'Eval author';
      }
      return `This eval belongs to ${author}`;
    }
    if (isCloudEnabled) {
      // In cloud mode, editable=true when no author OR author is someone else
      return 'Click to claim this eval';
    }
    return author ? 'Click to edit author' : 'Click to set author';
  };

  const renderPopoverContent = () => {
    if (isCloudEnabled) {
      // Cloud mode: shows claim UI (popover opens for unclaimed evals or evals claimed by others)
      return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', width: '400px' }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {author
              ? `This eval is currently attributed to ${author}.`
              : 'This eval has no author assigned.'}
          </Typography>
          <Button
            variant="contained"
            onClick={() => handleCloudAction(currentUserEmail || '')}
            disabled={isLoading || !currentUserEmail}
          >
            {isLoading ? (
              <CircularProgress size={24} />
            ) : currentUserEmail ? (
              `Claim as mine (${currentUserEmail})`
            ) : (
              'Loading...'
            )}
          </Button>
          {error && (
            <Typography color="error" variant="caption" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </Box>
      );
    }

    // Non-cloud mode: keep existing free text UI
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', width: '400px' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', mb: 2 }}>
          <TextField
            label="Author Email"
            variant="standard"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            error={!!error}
            helperText={error}
            disabled={isLoading}
            sx={{ flexGrow: 1, mr: 2 }}
          />
          <Button onClick={handleSave} disabled={isLoading || !email}>
            {isLoading ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </Box>
        {!currentUserEmail && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <InfoIcon color="info" fontSize="small" sx={{ mr: 1 }} />
            <Typography variant="caption">
              {`Setting an email address will also set the default author for future evals.
                It is changeable with \`promptfoo auth login\``}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  const open = Boolean(anchorEl);
  const id = open ? 'author-popover' : undefined;

  return (
    <>
      <Tooltip title={getTooltipTitle()}>
        <Box
          display="flex"
          alignItems="center"
          onClick={editable ? handleClick : undefined}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            px: 1,
            py: 0.5,
            '&:hover': {
              bgcolor: 'action.hover',
            },
            minHeight: 40,
            cursor: editable ? 'pointer' : 'default',
          }}
        >
          <EmailIcon fontSize="small" sx={{ mr: 1, opacity: 0.7 }} />
          <Typography variant="body2" sx={{ mr: 1 }}>
            <strong>Author:</strong> {author || 'Unknown'}
          </Typography>
          {editable && (
            <IconButton size="small" sx={{ ml: 'auto' }} disabled={isLoading}>
              <EditIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Tooltip>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        {renderPopoverContent()}
      </Popover>
    </>
  );
};
