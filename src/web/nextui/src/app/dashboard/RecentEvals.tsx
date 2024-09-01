import React, { useState } from 'react';
import type { StandaloneEval } from '@/../../../util';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Link,
  TablePagination,
} from '@mui/material';

const RecentEvals: React.FC<{ evals: StandaloneEval[] }> = ({ evals }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(10);

  const sortedEvals = evals.sort((a, b) => b.createdAt - a.createdAt);

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
            <TableCell>Eval ID</TableCell>
            <TableCell>Date</TableCell>
            <TableCell align="right">Pass Rate</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedEvals
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((eval_, index) => {
              const passRate =
                eval_.metrics?.testPassCount && eval_.metrics?.testFailCount
                  ? (eval_.metrics.testPassCount /
                      (eval_.metrics.testPassCount + eval_.metrics.testFailCount)) *
                    100
                  : 0;
              return (
                <TableRow key={index}>
                  <TableCell>
                    <Link href={`/eval?evalId=${eval_.evalId}`}>
                      {eval_.description || eval_.evalId}
                    </Link>
                  </TableCell>
                  <TableCell>{new Date(eval_.createdAt).toLocaleString()}</TableCell>
                  <TableCell align="right">{passRate.toFixed(1)}%</TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
      <TablePagination
        rowsPerPageOptions={[20]}
        component="div"
        count={sortedEvals.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
      />
    </>
  );
};

export default RecentEvals;
