import { usePageMeta } from '@app/hooks/usePageMeta';
import Container from '@mui/material/Container';
import { useNavigate } from 'react-router-dom';
import EvalsDataGrid from './components/EvalsDataGrid';

export default function EvalsIndexPage() {
  const navigate = useNavigate();

  usePageMeta({ title: 'Evals', description: 'Browse evaluation runs' });

  return (
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
  );
}
