import React from 'react';
import { Button } from '@mui/material';

interface WalkthroughTabProps {
  caption: string;
  isActive: boolean;
  onClick: () => void;
}

export default function WalkthroughTab({ caption, isActive, onClick }: WalkthroughTabProps) {
  return (
    <Button
      onClick={onClick}
      sx={{
        py: 2,
        px: 3,
        fontSize: '1.25rem',
        borderBottom: isActive ? '2px solid primary.main' : 'none',
        color: isActive ? 'primary.main' : 'text.primary',
        '&:hover': {
          backgroundColor: 'transparent',
          color: isActive ? 'primary.main' : 'primary.light',
        },
      }}
    >
      {caption}
    </Button>
  );
}
