import { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { useNavigate } from 'react-router-dom';
import RedTeamsDataGrid from '../../../results/components/RedTeamsDataGrid';
import type { EvalSummary } from '@promptfoo/types';

export default function ReportIndex() {
  const [data, setData] = useState<EvalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const resp = await callApi('/results?type=redteam&includeProviders=true', {
        cache: 'no-store',
      });
      if (!resp.ok) {
        throw new Error(`${resp.status}: ${resp.statusText}`);
      }
      const body = (await resp.json()) as { data: EvalSummary[] };
      setData(body.data);
      setError(null);
    } catch (error) {
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Container maxWidth="xl" sx={{ mt: 4 }}>
      {error && <Alert severity="error">{error.message}</Alert>}
      <Box
        sx={{
          height: '80vh',
        }}
      >
        <Paper sx={{ height: '100%' }}>
          <RedTeamsDataGrid
            data={data}
            isLoading={isLoading}
            onRowSelected={(evalId) => navigate(`/reports?evalId=${evalId}`)}
          />
        </Paper>
      </Box>
    </Container>
  );
}
