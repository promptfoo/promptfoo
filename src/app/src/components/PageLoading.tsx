import { Box, CircularProgress, Typography } from '@mui/material';

interface PageLoadingProps {
  message?: string;
  size?: number;
}

export default function PageLoading({ message = 'Loading page...', size = 40 }: PageLoadingProps) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="200px"
      gap={2}
    >
      <CircularProgress size={size} />
      <Typography variant="body1" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}
