import React from 'react';
import { useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ResultLightweightWithLabel } from '@promptfoo/types';
import fuzzysearch from 'fuzzysearch';

type SortField = 'description' | 'createdAt' | 'evalId';

const ReportIndex: React.FC = () => {
  const navigate = useNavigate();
  const [recentEvals, setRecentEvals] = React.useState<ResultLightweightWithLabel[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [sortField, setSortField] = React.useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = React.useState('');

  React.useEffect(() => {
    const fetchRecentEvals = async () => {
      try {
        const resp = await callApi('/results', { cache: 'no-store' });
        if (!resp.ok) {
          console.error('Failed to fetch recent evals');
          return;
        }
        const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
        // Only show redteam evals
        const redteamEvals = body.data.filter((eval_) => eval_.isRedteam);
        setRecentEvals(redteamEvals);
      } catch (error) {
        console.error('Error fetching recent evals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentEvals();
  }, []);

  const handleSort = (field: SortField) => {
    const isAsc = sortField === field && sortOrder === 'asc';
    setSortField(field);
    setSortOrder(isAsc ? 'desc' : 'asc');
  };

  const filteredAndSortedEvals = React.useMemo(() => {
    const filtered = recentEvals.filter((eval_) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        fuzzysearch(searchLower, (eval_.description || '').toLowerCase()) ||
        fuzzysearch(searchLower, eval_.evalId.toLowerCase())
      );
    });

    return filtered.sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;

      switch (sortField) {
        case 'createdAt':
          return multiplier * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case 'description':
          return multiplier * (a.description || '').localeCompare(b.description || '');
        case 'evalId':
          return multiplier * a.evalId.localeCompare(b.evalId);
        default:
          return 0;
      }
    });
  }, [recentEvals, sortField, sortOrder, searchQuery]);

  if (isLoading) {
    return <Box sx={{ width: '100%', textAlign: 'center' }}>Loading...</Box>;
  }

  if (recentEvals.length === 0) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              No Red Team evaluations found
            </Typography>
            <Typography variant="body1">
              Run a red team evaluation first to see results here.
            </Typography>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Recent reports
      </Typography>
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search by name or eval ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
        />
      </Box>
      <TableContainer component={Card}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'description'}
                  direction={sortField === 'description' ? sortOrder : 'asc'}
                  onClick={() => handleSort('description')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'createdAt'}
                  direction={sortField === 'createdAt' ? sortOrder : 'asc'}
                  onClick={() => handleSort('createdAt')}
                >
                  Date
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === 'evalId'}
                  direction={sortField === 'evalId' ? sortOrder : 'asc'}
                  onClick={() => handleSort('evalId')}
                >
                  Eval ID
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredAndSortedEvals.map((eval_) => (
              <TableRow
                key={eval_.evalId}
                hover
                onClick={() => navigate(`/report?evalId=${eval_.evalId}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Typography variant="body1">
                    {eval_.description || 'Untitled Evaluation'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {new Date(eval_.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {eval_.evalId}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default ReportIndex;
