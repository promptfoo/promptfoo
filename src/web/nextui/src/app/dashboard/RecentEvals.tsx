import React from 'react';
import type { StandaloneEval } from '@/../../../util';
import { Typography, Table, TableBody, TableCell, TableHead, TableRow, Link } from '@mui/material';

const RecentEvals: React.FC<{ evals: StandaloneEval[] }> = ({ evals }) => {
  const sortedEvals = evals
    //.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Recent Evaluations
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
          {sortedEvals.map((eval_, index) => {
            const passRate =
              eval_.metrics?.testPassCount && eval_.metrics?.testFailCount
                ? (eval_.metrics.testPassCount /
                    (eval_.metrics.testPassCount + eval_.metrics.testFailCount)) *
                  100
                : 0;
            return (
              <TableRow key={index}>
                <TableCell>
                  <Link href={`/eval?evalId=${eval_.evalId}`}>{eval_.evalId}</Link>
                </TableCell>
                {/*<TableCell>{new Date(eval_.createdAt).toLocaleDateString()}</TableCell>*/}
                <TableCell>{new Date().toLocaleDateString()}</TableCell>
                <TableCell align="right">{passRate.toFixed(1)}%</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
};

export default RecentEvals;
