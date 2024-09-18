import React from 'react';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface MetricCardProps {
  title: string;
  value: string;
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
  sentiment?: 'good' | 'bad' | 'flat';
  subtitle?: string; // Add this line
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  trend,
  trendValue,
  sentiment,
  subtitle,
}) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return (
          <TrendingUpIcon sx={{ color: sentiment === 'good' ? 'success.main' : 'error.main' }} />
        );
      case 'down':
        return (
          <TrendingDownIcon sx={{ color: sentiment === 'bad' ? 'error.main' : 'success.main' }} />
        );
      case 'flat':
        return <TrendingFlatIcon sx={{ color: 'text.secondary' }} />;
      default:
        return null;
    }
  };

  return (
    <Paper
      elevation={3}
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 2,
      }}
    >
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {subtitle && ( // Add this block
        <Typography variant="caption" color="text.secondary" gutterBottom>
          {subtitle}
        </Typography>
      )}
      <Box
        sx={{
          mt: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          {value}
        </Typography>
        {trend && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            {getTrendIcon()}
            {trendValue && (
              <Typography variant="body2" sx={{ ml: 0.5 }}>
                {trendValue}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default MetricCard;
