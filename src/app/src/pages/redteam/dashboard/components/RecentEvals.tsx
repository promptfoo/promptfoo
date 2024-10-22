import React, { useState } from 'react';
import type { StandaloneEval } from '@/../../../util';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

const RecentEvals: React.FC<{ evals: StandaloneEval[] }> = ({ evals }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(10);

  const evalDisplay = evals
    .filter((eval_) => eval_.isRedteam)
    .sort((a, b) => b.createdAt - a.createdAt);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Recent Runs
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell style={{ whiteSpace: 'nowrap' }}>Eval ID</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Trigger</TableCell>
            <TableCell># Attacks Succeeded</TableCell>
            <TableCell># Total Attacks</TableCell>
            <TableCell>Attack Success Rate</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {evalDisplay
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((eval_, index) => {
              const attackSuccessRate =
                eval_.metrics?.testFailCount && eval_.metrics?.testPassCount
                  ? (eval_.metrics.testFailCount /
                      (eval_.metrics.testPassCount + eval_.metrics.testFailCount)) *
                    100
                  : 0;
              return (
                <TableRow key={index}>
                  <TableCell
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '150px',
                    }}
                  >
                    <Link href={`/report?evalId=${eval_.evalId}`}>
                      {eval_.description || eval_.evalId}
                    </Link>
                  </TableCell>
                  <TableCell
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '150px',
                    }}
                  >
                    {new Date(eval_.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>Manual</TableCell>
                  <TableCell>
                    {(eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0)}
                  </TableCell>
                  <TableCell>
                    {eval_.metrics?.testFailCount || 0} /{' '}
                    {(eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0)}
                  </TableCell>
                  <TableCell>{attackSuccessRate.toFixed(1)}%</TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
      <TablePagination
        rowsPerPageOptions={[20]}
        component="div"
        count={evalDisplay.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
      />
    </>
  );
};

export default RecentEvals;
