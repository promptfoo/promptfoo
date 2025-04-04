import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, alpha } from '@mui/material';
import EvalsDataGrid from './components/EvalsDataGrid';

export default function EvalsIndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Evals | promptfoo';
  }, []);

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.black, 0.2)
            : alpha(theme.palette.grey[50], 0.5),
        p: 3,
      }}
    >
      <EvalsDataGrid onEvalSelected={(evalId) => navigate(`/eval/${evalId}`)} showUtilityButtons />
    </Box>
  );
}
