import React from 'react';
import EditIcon from '@mui/icons-material/Edit';
import EmailIcon from '@mui/icons-material/Email';
import { Box, Typography, IconButton, Tooltip, CircularProgress } from '@mui/material';

interface AuthorChipProps {
  author: string | null;
  onEditAuthor: () => Promise<void>;
}

export const AuthorChip: React.FC<AuthorChipProps> = ({ author, onEditAuthor }) => {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    await onEditAuthor();
    setIsLoading(false);
  };

  return (
    <Tooltip title={author ? 'Click to edit author' : 'Click to set author'}>
      <Box
        display="flex"
        alignItems="center"
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          px: 1,
          py: 0.5,
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <EmailIcon fontSize="small" sx={{ mr: 1, opacity: 0.7 }} />
        <Typography variant="body2" sx={{ mr: 1 }}>
          <strong>Author:</strong> {author || 'Unknown'}
        </Typography>
        <IconButton size="small" onClick={handleClick} sx={{ ml: 'auto' }} disabled={isLoading}>
          {isLoading ? <CircularProgress size={20} /> : <EditIcon fontSize="small" />}
        </IconButton>
      </Box>
    </Tooltip>
  );
};
