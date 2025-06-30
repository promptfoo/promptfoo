import React from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface EvalIdChipProps {
  evalId: string;
  onCopy: () => void;
}

export const EvalIdChip: React.FC<EvalIdChipProps> = ({ evalId, onCopy }) => {
  const handleCopy = () => {
    onCopy();
  };

  return (
    <>
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
        <FingerprintIcon fontSize="small" sx={{ mr: 1, opacity: 0.7 }} />
        <Typography variant="body2" sx={{ mr: 1 }}>
          <strong>ID:</strong> {evalId}
        </Typography>
        <Tooltip title="Copy ID">
          <IconButton
            size="small"
            onClick={handleCopy}
            sx={{ ml: 'auto' }}
            aria-label="Copy Eval ID"
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </>
  );
};
