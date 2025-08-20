import React, {
  useEffect,
  useState,
} from 'react';

import { Link } from 'react-router-dom';

import { callApi } from '@app/utils/api';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

interface RepoScanRow {
  id: string;
  createdAt: number;
  label?: string;
  rootPaths?: string[];
  result: { summary: { findingsCount: number } };
}

export default function RepoScansIndexPage() {
  const [rows, setRows] = useState<RepoScanRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await callApi('/repo-scans');
      const json = await res.json();
      setRows(json.data as RepoScanRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(id: string) {
    if (!confirm('Delete this scan?')) return;
    await callApi(`/repo-scans/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" sx={{ mb: 2 }}>
        Repo Scans
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Label</TableCell>
              <TableCell>Roots</TableCell>
              <TableCell align="right">Findings</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Link to={`/repo-scans/${r.id}`}>{r.id.slice(0, 8)}</Link>
                </TableCell>
                <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell>{r.label || ''}</TableCell>
                <TableCell>{(r.rootPaths || []).join(', ')}</TableCell>
                <TableCell align="right">{r.result?.summary?.findingsCount ?? 0}</TableCell>
                <TableCell align="right">
                  <Button size="small" color="error" onClick={() => onDelete(r.id)} disabled={loading}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
} 