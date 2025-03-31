import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Typography, Box } from '@mui/material';
import EvalsDataGrid from './components/EvalsDataGrid';

export default function EvalsIndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Evals | promptfoo';
  }, []);

  return (
    <Container maxWidth="xl" sx={{ py: 4, height: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Evals
      </Typography>
      <Box sx={{ height: '100%' }}>
        <Paper sx={{ height: '100%' }}>
          <EvalsDataGrid
            onEvalSelected={(evalId) => navigate(`/eval/${evalId}`)}
            showUtilityButtons
          />
        </Paper>
      </Box>
    </Container>
  );
}
