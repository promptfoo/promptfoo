import { usePageMeta } from '@app/hooks/usePageMeta';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { useNavigate } from 'react-router-dom';
import EvalsDataGrid from './components/EvalsDataGrid';

export default function EvalsIndexPage() {
  const navigate = useNavigate();

  usePageMeta({ title: 'Evals', description: 'Browse evaluation runs' });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Container
          maxWidth="xl"
          sx={{
            height: '100%',
            py: 2,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <EvalsDataGrid
            onEvalSelected={(evalId) => navigate(`/eval/${evalId}`)}
            showUtilityButtons
            deletionEnabled
          />
        </Container>
      </Box>
    </Box>
  );
}
