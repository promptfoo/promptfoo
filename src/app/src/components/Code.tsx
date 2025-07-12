import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

export default function Code({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Box
      component="pre"
      sx={{
        p: 2,
        mb: 2,
        backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
        borderRadius: 1,
        fontFamily: 'monospace',
        fontSize: '0.875rem',
      }}
    >
      {children}
    </Box>
  );
}
