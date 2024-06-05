import React, { useState } from 'react';
import yaml from 'js-yaml';
import Link from 'next/link';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Pagination from '@mui/material/Pagination';

import type { TestCasesWithMetadata } from '@/../../../types';

interface DatasetDialogProps {
  openDialog: boolean;
  handleClose: () => void;
  testCase: TestCasesWithMetadata & { recentEvalDate: string };
}

export default function DatasetDialog({ openDialog, handleClose, testCase }: DatasetDialogProps) {
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const handleChangePage = (event: React.ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
  };

  return (
    <Dialog open={openDialog} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>Dataset {testCase.id.slice(0, 6)}</DialogTitle>
      <DialogContent>
        <Typography variant="h6" style={{ marginTop: '1rem' }}>
          Test cases
        </Typography>
        <TextareaAutosize
          readOnly
          value={testCase && yaml.dump(testCase.testCases)}
          style={{ width: '100%', padding: '0.75rem' }}
          maxRows={15}
        />
        <Typography variant="h6" style={{ marginTop: '1rem' }}>
          Used in...
        </Typography>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Eval ID</TableCell>
              <TableCell>Prompt ID</TableCell>
              <TableCell>Raw score</TableCell>
              <TableCell>Pass rate</TableCell>
              <TableCell>Pass count</TableCell>
              <TableCell>Fail count</TableCell>
              <TableCell>Prompt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {testCase?.prompts
              ?.slice((page - 1) * rowsPerPage, page * rowsPerPage)
              .sort((a, b) => b.evalId.localeCompare(a.evalId))
              .map((promptData, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Link href={`/eval/?evalId=${promptData.evalId}`}>{promptData.evalId}</Link>
                  </TableCell>
                  <TableCell style={{ minWidth: '8em' }}>
                    <Link href={`/prompts/?id=${promptData.id}`}>{promptData.id.slice(0, 6)}</Link>
                  </TableCell>
                  <TableCell>
                    {typeof promptData.prompt.metrics?.score === 'number'
                      ? promptData.prompt.metrics.score.toFixed(2)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {typeof promptData.prompt.metrics?.testPassCount === 'number' &&
                    typeof promptData.prompt.metrics?.testFailCount === 'number' &&
                    promptData.prompt.metrics.testPassCount +
                      promptData.prompt.metrics.testFailCount >
                      0
                      ? (
                          (promptData.prompt.metrics.testPassCount /
                            (promptData.prompt.metrics.testPassCount +
                              promptData.prompt.metrics.testFailCount)) *
                          100.0
                        ).toFixed(2) + '%'
                      : '-'}
                  </TableCell>
                  <TableCell>{promptData.prompt.metrics?.testPassCount ?? '-'}</TableCell>
                  <TableCell>{promptData.prompt.metrics?.testFailCount ?? '-'}</TableCell>
                  <TableCell>
                    {promptData.prompt.raw.length > 250
                      ? promptData.prompt.raw.slice(0, 250) + '...'
                      : promptData.prompt.raw}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {Math.ceil((testCase?.prompts?.length || 0) / rowsPerPage) > 1 && (
          <Pagination
            count={Math.ceil(testCase.prompts.length / rowsPerPage)}
            page={page}
            onChange={handleChangePage}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
