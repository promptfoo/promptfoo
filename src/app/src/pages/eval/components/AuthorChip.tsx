import type { KeyboardEvent } from 'react';
import React, { useState, useEffect } from 'react';
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
}

export const AuthorChip: React.FC<AuthorChipProps> = ({
  author,
  onEditAuthor,
  currentUserEmail,
  editable,
}) => {
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

  const handleKeyPress = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      handleSave();
    }
  };

  const open = Boolean(anchorEl);
  const id = open ? 'author-popover' : undefined;

  return (
    <>
      <Tooltip
        title={editable ? (author ? 'Click to edit author' : 'Click to set author') : 'Author'}
      >
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
                It is changeable with \`promptfoo config set email <your-email@example.com>\``}
              </Typography>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
};
