import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';

interface PresetCardProps {
  name: string;
  isSelected: boolean;
  onClick: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ name, isSelected, onClick }) => {
  return (
    <Card
      onClick={onClick}
      sx={{
        height: '100%',
        cursor: 'pointer',
        outline: isSelected ? 2 : 1,
        outlineColor: isSelected ? 'primary.main' : 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CardContent sx={{ textAlign: 'center', position: 'relative' }}>
        <Typography variant="h6" component="div">
          {name}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default PresetCard;
